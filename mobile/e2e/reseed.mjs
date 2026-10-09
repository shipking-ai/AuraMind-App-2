// CI only: makes the e2e account's first 5 cards due again before a run, so
// every dispatch starts from the same state (a run schedules them away).
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: users, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;
const user = users.users.find((u) => u.email === process.env.E2E_EMAIL);
if (!user) throw new Error('E2E account not found');
const { data: cards, error } = await admin.from('cards').select('id').eq('user_id', user.id).order('id').limit(5);
if (error) throw error;
if (!cards || cards.length < 5) throw new Error('seed the e2e account with one deck of at least 5 cards');
const due = new Date(Date.now() - 60_000).toISOString();
const { error: updateError } = await admin.from('cards').update({ next_review: due }).in('id', cards.map((c) => c.id));
if (updateError) throw updateError;
console.log('reseeded 5 due cards');
