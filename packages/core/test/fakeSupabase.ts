/**
 * A recording stand-in for SupabaseClient: every builder call is logged in
 * order, and awaiting a query resolves to the scripted result for its table
 * (a value, or a function of the recorded call for per-query answers).
 */
export interface FakeCall { table?: string; rpc?: string; args?: unknown; chain: [string, unknown[]][] }
type Result = { data?: unknown; error?: unknown };
export interface Script {
  rpc?: Record<string, Result>;
  tables?: Record<string, Result | ((call: FakeCall) => Result)>;
}

export function fakeSupabase(script: Script = {}) {
  const calls: FakeCall[] = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push({ rpc: name, args, chain: [] });
      return { data: null, error: null, ...script.rpc?.[name] };
    },
    from(table: string) {
      const call: FakeCall = { table, chain: [] };
      calls.push(call);
      const builder: any = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            const s = script.tables?.[table];
            const res = typeof s === 'function' ? s(call) : s ?? { data: [] };
            return (ok: (v: unknown) => void, bad: (e: unknown) => void) =>
              Promise.resolve({ data: null, error: null, ...res }).then(ok, bad);
          }
          return (...args: unknown[]) => { call.chain.push([String(prop), args]); return builder; };
        },
      });
      return builder;
    },
  };
  return { client: client as any, calls };
}

export const op = (call: FakeCall, name: string) => call.chain.find(([n]) => n === name)?.[1];
