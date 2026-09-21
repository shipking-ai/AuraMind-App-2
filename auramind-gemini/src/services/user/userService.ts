import { supabase } from '../database/supabase';
import { UserProfile, UserRole } from '../../types';
import { toIsoOrNull } from '../../lib/timestamps';

/**
 * Whitelist of `user_profiles` columns declared as TIMESTAMPTZ in the live
 * schema (or, defensively, in any new deployment we ship). Without this
 * allowlist, a typo or a future ephemeral migration could land a raw
 * Date.now() on a TIMESTAMPTZ column and 22008 again.
 *
 * Coverage is intentionally narrow-but-correct — every TIMESTAMPTZ column
 * that exists today on user_profiles, sourced from the migration chain.
 * Adding a new column to user_profiles: append it here so a future
 * `updateUserProfile` write doesn't 22008.
 *
 * The wider `profiles` table (Stripe + trial surface) has its own
 * columns; those are mutated only from the Stripe webhook service
 * which already uses `.toISOString()` writes — see
 * `src/services/stripe/stripeWebhookService.ts`.
 */
const TIMETZ_USER_PROFILE_COLUMNS = new Set([
  'joined_date',
  'last_study_date',
  'updated_at',
  // Created-at columns maintained by Postgres DEFAULT NOW() (no explicit
  // write call exists in src/ today, but future PRs that legitimately
  // set created_at — e.g., a backfill from auth.users.created_at on a
  // hand-migrated account — will silently 22008 without this entry.
  // Same belt-and-braces reasoning as updated_at above.
  'created_at',
]);

export const userService = {
  async getCurrentUser(): Promise<UserProfile | null> {
    if (!supabase) {
      console.warn('Supabase not initialized');
      return null;
    }

    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }

    // Fetch user profile from database. Uses `.maybeSingle()` so a brand-new
    // account (0 rows for the just-signed-up user) returns null instead of
    // throwing PGRST116 — the `if (profileError || !profile)` branch below
    // then handles the create-if-missing path. The previous `.single()`
    // would crash on every freshly-authenticated user on first render.
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      // Create default profile if it doesn't exist. The INSERT-then-SELECT
      // pattern below is GUARANTEED-at-least-one-row because we just
      // inserted it; `.single()` here is safe to keep (PostgREST has no
      // ambiguity window on a fresh insert + immediate return in the same
      // statement). If we ever split this into two round trips, switch to
      // `.maybeSingle()` here.
      // Belt-and-braces TIMESTAMPTZ sanitization on INSERT. pre-encoded
      // `joined_date` was `Date.now()` (numeric) which, against a
      // TIMESTAMPTZ live DB, fires 22008 datetime_field_overflow at the
      // create-new-account path — every brand-new signup would 400.
      // Direct `new Date().toISOString()` is equivalent to
      // `new Date(Date.now()).toISOString()` and leans on one fewer
      // indirection. Belt-and-braces for the live TIMESTAMPTZ column
      // on user_profiles.joined_date.
      const newProfileInsert = {
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        role: UserRole.USER,
        plan: 'Starter',
        streak: 0,
        joined_date: new Date().toISOString(),
        isEmailVerified: user.email_confirmed_at ? true : false,
        isPhoneVerified: false,
      };
      const { data: newProfile, error: createError } = await supabase
        .from('user_profiles')
        .insert(newProfileInsert)
        .select('*')
        .single();

      if (createError || !newProfile) {
        console.error('Error creating user profile:', createError);
        return null;
      }

      return {
        id: newProfile.id,
        email: newProfile.email,
        name: newProfile.name,
        plan: newProfile.plan,
        streak: newProfile.streak,
        joinedDate: newProfile.joined_date,
        avatar: user.user_metadata?.avatar_url || undefined,
        role: newProfile.role,
        isEmailVerified: newProfile.isEmailVerified,
        isPhoneVerified: newProfile.isPhoneVerified,
        streakFreezes: newProfile.streak_freezes || 0
      };
    }

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      plan: profile.plan,
      streak: profile.streak,
      joinedDate: profile.joined_date,
      // Avatar lives in auth users' user_metadata (user_profiles has no
      // avatar_url column), written by updateUserProfile via
      // `auth.updateUser()`. Surfacing it here keeps the Settings page in
      // sync with the top-right avatar on every platform — and lets an
      // avatar uploaded on mobile appear on desktop.
      avatar: user.user_metadata?.avatar_url || undefined,
      role: profile.role,
      isEmailVerified: profile.isEmailVerified,
      isPhoneVerified: profile.isPhoneVerified,
      streakFreezes: profile.streak_freezes || 0
    };
  },

  async updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    // `Partial<UserProfile>` keys are camelCase; the schema columns are
    // snake_case. Build a sanitized SERVER-KEYED payload by stepping through
    // the camelCase → snake_case mapping used elsewhere in this file
    // (joinedDate → joined_date, lastStudyDate → last_study_date, …). For
    // each server key:
    //   - skip if value is undefined (no-op column drop)
    //   - PRESERVE if value is null (Stripe cancellation needs to clear
    //     stripe_customer_id by writing SQL NULL; the previous skip-null
    //     refactor was a regression on that path)
    //   - sanitize ms-epoch → ISO for TIMESTAMPTZ columns via the
    //     allowlist defined at module-scope
    //   - pass through everything else verbatim so unrelated columns
    //     (streak, name, plan, …) keep their numeric/string shape
    const CAMEL_TO_SNAKE: Record<string, string> = {
      joinedDate: 'joined_date',
      lastStudyDate: 'last_study_date',
    };
    const sanitized: Record<string, unknown> = {};

    for (const [camelKey, value] of Object.entries(updates)) {
      if (camelKey === 'id') continue; // id is the .eq() filter, not a SET column
      if (value === undefined) continue;
      const snakeKey = CAMEL_TO_SNAKE[camelKey] ?? camelKey;
      if (TIMETZ_USER_PROFILE_COLUMNS.has(snakeKey)) {
        // Sanitize TIMESTAMPTZ columns. `null` is a valid payload (SQL NULL
        // clears the column); undefined already filtered above; everything
        // else routes through toIsoOrNull which returns null for blanks/NaN.
        sanitized[snakeKey] = toIsoOrNull(value);
      } else {
        sanitized[snakeKey] = value;
      }
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .update(sanitized)
      .eq('id', updates.id)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error('Failed to update user profile');
    }

    return data;
  },

  async getAllUsers(): Promise<UserProfile[]> {
    if (!supabase) {
      console.warn('Supabase not initialized');
      return [];
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('joined_date', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      throw error;
    }

    return data || [];
  },

  async toggleUserRole(userId: string, newRole: UserRole): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      console.error('Error updating user role:', error);
      return false;
    }

    return true;
  }
};



