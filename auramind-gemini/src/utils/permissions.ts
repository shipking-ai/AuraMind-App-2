import { UserRole } from '../types';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.OWNER]: 100,
  [UserRole.CEO]: 90,
  [UserRole.ADMIN]: 80,
  [UserRole.EMPLOYEE]: 50,
  [UserRole.TESTER]: 30,
  [UserRole.USER]: 10
};

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Owner',
  [UserRole.CEO]: 'CEO',
  [UserRole.ADMIN]: 'Admin',
  [UserRole.EMPLOYEE]: 'Employee',
  [UserRole.TESTER]: 'Tester',
  [UserRole.USER]: 'User'
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Full system access, can manage all roles and settings',
  [UserRole.CEO]: 'Executive access, can manage admins and view all data',
  [UserRole.ADMIN]: 'Administrative access, can manage users and content',
  [UserRole.EMPLOYEE]: 'Staff access, can view analytics and manage basic operations',
  [UserRole.TESTER]: 'Internal QA account, bypasses the paywall for testing only',
  [UserRole.USER]: 'Standard user access'
};

export interface Permission {
  canManageUsers: boolean;
  canManageRoles: boolean;
  canViewAnalytics: boolean;
  canManageCoupons: boolean;
  canManageSettings: boolean;
  canViewAllData: boolean;
  canDeleteUsers: boolean;
  canAccessAdminPanel: boolean;
  hasFreeAccess: boolean;
}

export const getPermissions = (role: UserRole = UserRole.USER): Permission => {
  const level = ROLE_HIERARCHY[role];

  return {
    canManageUsers: level >= ROLE_HIERARCHY[UserRole.ADMIN],
    canManageRoles: level >= ROLE_HIERARCHY[ROLE_HIERARCHY[UserRole.CEO] ? UserRole.CEO : UserRole.OWNER],
    canViewAnalytics: level >= ROLE_HIERARCHY[UserRole.EMPLOYEE],
    canManageCoupons: level >= ROLE_HIERARCHY[UserRole.ADMIN],
    canManageSettings: level >= ROLE_HIERARCHY[UserRole.CEO],
    canViewAllData: level >= ROLE_HIERARCHY[UserRole.CEO],
    canDeleteUsers: level >= ROLE_HIERARCHY[UserRole.OWNER],
    canAccessAdminPanel: level >= ROLE_HIERARCHY[UserRole.ADMIN],
    // Testers are internal QA accounts: they skip the paywall to exercise the
    // product but get NO staff or admin powers.
    hasFreeAccess: level >= ROLE_HIERARCHY[UserRole.ADMIN] || role === UserRole.TESTER
  };
};

export const canManageRole = (managerRole: UserRole, targetRole: UserRole): boolean => {
  const _managerLevel = ROLE_HIERARCHY[managerRole];
  const targetLevel = ROLE_HIERARCHY[targetRole];
  
  // Can only manage roles with lower or equal level
  // Owner can manage everyone
  if (managerRole === UserRole.OWNER) return true;
  
  // CEO can manage everyone except Owner
  if (managerRole === UserRole.CEO) return targetRole !== UserRole.OWNER;
  
  // Admin can manage employees and users
  if (managerRole === UserRole.ADMIN) {
    return targetLevel <= ROLE_HIERARCHY[UserRole.EMPLOYEE];
  }
  
  // Employees and users cannot manage roles
  return false;
};

export const getDefaultRole = (email?: string): UserRole => {
  const ownerEmail = import.meta.env.VITE_OWNER_EMAIL;
  if (ownerEmail && email === ownerEmail) return UserRole.OWNER;
  return UserRole.USER;
};

const USER_ROLE_VALUES: readonly string[] = Object.values(UserRole);

/**
 * Resolve the AUTHORIZATION role for a signed-in user.
 *
 * Reads `app_metadata.role` ONLY — the field only the service-role key can
 * write. `user_metadata.role` is client-writable (any signed-in user can set
 * it with one `auth.updateUser` call): it holds the onboarding persona
 * (student, teacher, …) and whatever else the user has written, and must
 * never reach `getPermissions`, or a user could grant themselves `tester`
 * free access — or staff-level access — from the browser console.
 *
 * An absent or unrecognised value fails closed to `fallback` (default USER),
 * never to "we don't know yet = elevated". Genuine staff are mirrored into
 * `app_metadata` by the admin API and synced into `user_profiles` by the
 * `sync_auth_role_to_profiles` trigger, so no user_metadata fallback is
 * needed — same deliberate no-fallback rule as the entitlement reader in
 * `api/_lib/entitlement.ts`.
 */
export function resolveAuthorizationRole(
  user:
    | { app_metadata?: Record<string, unknown> | null; user_metadata?: Record<string, unknown> | null }
    | null
    | undefined,
  fallback: UserRole = UserRole.USER,
): UserRole {
  const raw = user?.app_metadata?.role;
  if (typeof raw === "string" && (USER_ROLE_VALUES as readonly string[]).includes(raw)) {
    return raw as UserRole;
  }
  return fallback;
}

// `role` is optional because callers read it off a possibly-unloaded
// profile (`workspace?.user?.role`). An absent role must fail closed —
// never treat "we don't know yet" as elevated access.
export const isAdminOrHigher = (role?: UserRole): boolean => {
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.ADMIN];
};

export const isEmployeeOrHigher = (role?: UserRole): boolean => {
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.EMPLOYEE];
};

export const isCeoOrHigher = (role?: UserRole): boolean => {
  return (ROLE_HIERARCHY[role ?? UserRole.USER] ?? 0) >= ROLE_HIERARCHY[UserRole.CEO];
};

export const isOwnerOnly = (role?: UserRole): boolean => {
  return role === UserRole.OWNER;
};

export interface RoleBadgeConfig {
  label: string;
  icon: 'crown' | 'star' | 'shield' | 'badge';
  textColor: string;
  ringColor: string;
  gradient: string;
  shimmerColor: string;
  avatarGlow: string;
  avatarGlowStrong: string;
  animation: 'shimmer' | 'glow-pulse' | 'subtle-pulse';
}

export const getRoleBadgeConfig = (role?: UserRole): RoleBadgeConfig | null => {
  if (!role) return null;

  const configs: Partial<Record<UserRole, RoleBadgeConfig>> = {
    [UserRole.OWNER]: {
      label: 'Owner',
      icon: 'crown',
      textColor: 'text-purple-200',
      ringColor: 'ring-purple-400/50',
      gradient: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(139,92,246,0.15), rgba(168,85,247,0.25))',
      shimmerColor: 'rgba(192,132,252,0.35)',
      avatarGlow: '0 0 20px rgba(168,85,247,0.5), 0 0 40px rgba(139,92,246,0.25)',
      avatarGlowStrong: '0 0 28px rgba(168,85,247,0.7), 0 0 56px rgba(139,92,246,0.45)',
      animation: 'glow-pulse',
    },
    [UserRole.CEO]: {
      label: 'CEO',
      icon: 'star',
      textColor: 'text-amber-200',
      ringColor: 'ring-amber-400/40',
      gradient: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(251,191,36,0.12), rgba(245,158,11,0.25))',
      shimmerColor: 'rgba(252,211,77,0.4)',
      avatarGlow: '0 0 20px rgba(245,158,11,0.45), 0 0 40px rgba(251,191,36,0.2)',
      avatarGlowStrong: '0 0 20px rgba(245,158,11,0.45), 0 0 40px rgba(251,191,36,0.2)',
      animation: 'shimmer',
    },
    [UserRole.ADMIN]: {
      label: 'Admin',
      icon: 'shield',
      textColor: 'text-amber-300',
      ringColor: 'ring-amber-500/40',
      gradient: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.1), rgba(245,158,11,0.15))',
      shimmerColor: 'rgba(251,191,36,0.3)',
      avatarGlow: '0 0 15px rgba(245,158,11,0.3), 0 0 30px rgba(217,119,6,0.15)',
      avatarGlowStrong: '0 0 15px rgba(245,158,11,0.3), 0 0 30px rgba(217,119,6,0.15)',
      animation: 'shimmer',
    },
    [UserRole.EMPLOYEE]: {
      label: 'Staff',
      icon: 'badge',
      textColor: 'text-teal-200',
      ringColor: 'ring-teal-400/30',
      gradient: 'linear-gradient(135deg, rgba(20,184,166,0.15), rgba(13,148,136,0.1), rgba(20,184,166,0.15))',
      shimmerColor: 'rgba(45,212,191,0.25)',
      avatarGlow: '0 0 12px rgba(20,184,166,0.25), 0 0 24px rgba(13,148,136,0.12)',
      avatarGlowStrong: '0 0 12px rgba(20,184,166,0.25), 0 0 24px rgba(13,148,136,0.12)',
      animation: 'subtle-pulse',
    },
  };

  return configs[role] ?? null;
};


