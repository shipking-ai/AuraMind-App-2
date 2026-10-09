jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => mem.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => { mem.set(k, v); },
    deleteItemAsync: async (k: string) => { mem.delete(k); },
  };
});
jest.mock('../../env', () => ({ env: { supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon' } }));

it('uses PKCE so the OAuth callback carries a ?code= the app can exchange', async () => {
  const { getSupabase } = require('../supabase');
  const { data } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'bonamind://auth/callback', skipBrowserRedirect: true },
  });
  expect(data.url).toContain('code_challenge=');
  expect(data.url).toContain('code_challenge_method=s256');
});
