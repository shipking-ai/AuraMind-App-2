// CI only: after the Maestro run, the test account must have exactly the
// reviews the flow made since `since`, each at a distinct instant (an outbox
// replay must never duplicate one).
import { createClient } from '@supabase/supabase-js';

const [since, userId, expected] = process.argv.slice(2);
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await admin.from('card_reviews').select('card_id, reviewed_at').eq('user_id', userId).gte('reviewed_at', since);
if (error) throw error;
const distinct = new Set(data.map((r) => `${r.card_id}@${r.reviewed_at}`));
console.log(`reviews since ${since}: ${data.length} (${distinct.size} distinct)`);
if (data.length !== Number(expected) || distinct.size !== data.length) {
  console.error(`::error::expected ${expected} distinct reviews, got ${data.length} (${distinct.size} distinct)`);
  process.exit(1);
}
