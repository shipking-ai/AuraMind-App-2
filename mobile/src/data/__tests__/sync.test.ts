import { createSyncEngine } from '../sync';

function fakes() {
  let netListener: (s: { isConnected: boolean | null }) => void = () => {};
  let appListener: (s: string) => void = () => {};
  const outbox = {
    flush: jest.fn(async () => ({ sent: 0, dead: 0, stoppedEarly: false })),
    adoptUser: jest.fn(async () => 0),
    pending: jest.fn(async () => 0),
  };
  const engine = createSyncEngine({
    outbox,
    netinfo: { addEventListener: (l) => { netListener = l; return () => {}; } },
    appState: { addEventListener: (_e, l) => { appListener = l; return { remove() {} }; } },
  });
  return { engine, outbox, net: (c: boolean) => netListener({ isConnected: c }), app: (s: string) => appListener(s) };
}

it('flushes exactly once when the connection comes back', async () => {
  const { engine, outbox, net } = fakes();
  await engine.setUser('u1');
  outbox.flush.mockClear();
  net(false);
  net(true);
  net(true);
  await Promise.resolve();
  expect(outbox.flush).toHaveBeenCalledTimes(1);
  expect(outbox.flush).toHaveBeenCalledWith('u1');
  expect(engine.getState().online).toBe(true);
});

it('adopts the queue for whoever signs in', async () => {
  const { engine, outbox } = fakes();
  await engine.setUser('u2');
  expect(outbox.adoptUser).toHaveBeenCalledWith('u2');
});

it('flushes when the app returns to the foreground', async () => {
  const { engine, outbox, app } = fakes();
  await engine.setUser('u1');
  outbox.flush.mockClear();
  app('background');
  app('active');
  await Promise.resolve();
  expect(outbox.flush).toHaveBeenCalledTimes(1);
});

it('does nothing while signed out', async () => {
  const { engine, outbox, net } = fakes();
  await engine.setUser(null);
  net(false);
  net(true);
  expect(outbox.flush).not.toHaveBeenCalled();
});
