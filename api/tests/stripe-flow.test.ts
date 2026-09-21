import { describe, it, expect, vi, afterEach } from 'vitest';
import { call } from './helpers.js';
import webhookHandler from '../stripe-webhook.js';

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
  from: vi.fn(),
  rpc: vi.fn(),
}));

const stripeMock = vi.hoisted(() => ({
  sessions: { create: vi.fn() },
  portalSessions: { create: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
  prices: { retrieve: vi.fn() },
  customers: { retrieve: vi.fn() },
  webhooks: {
    constructEvent: vi.fn(),
  },
}));

const resendMock = vi.hoisted(() => ({
  emails: { send: vi.fn() },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabase),
}));

vi.mock('stripe', () => ({
  default: class StripeMock {
    checkout = { sessions: stripeMock.sessions };
    billingPortal = { sessions: stripeMock.portalSessions };
    subscriptions = stripeMock.subscriptions;
    prices = { retrieve: stripeMock.prices.retrieve };
    customers = stripeMock.customers;
    webhooks = stripeMock.webhooks;
  },
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = resendMock.emails;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
  supabase.auth.admin.getUserById.mockReset();
  supabase.auth.admin.updateUserById.mockReset();
  supabase.from.mockReset();
  supabase.rpc.mockReset();
  stripeMock.sessions.create.mockReset();
  stripeMock.portalSessions.create.mockReset();
  stripeMock.subscriptions.retrieve.mockReset();
  stripeMock.prices.retrieve.mockReset();
  stripeMock.customers.retrieve.mockReset();
  stripeMock.webhooks.constructEvent.mockReset();
  resendMock.emails.send.mockReset();
});

// Default ledger mock: event not seen, inserts succeed.
function mockLedgerFresh() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

function webhookRes() {
  const state = { status: 200, body: null as any };
  const res: any = {
    state,
    status(c: number) { state.status = c; return res; },
    setHeader() { return res; },
    send(b: any) { state.body = typeof b === 'string' ? JSON.parse(b) : b; return res; },
    json(b: any) { state.body = b; return res; },
  };
  return res;
}

describe('Stripe flow (mocked Stripe + Supabase + Resend)', () => {
  const AUTH = { authorization: 'Bearer valid-token' };
  const TEST_USER = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'buyer@example.com',
    user_metadata: {},
  };

  function mockAuthenticatedUser(user: any = TEST_USER) {
    supabase.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  }

  it('checkout: requires authentication', async () => {
    const { status, body } = await call('stripe/checkout', {
      body: { priceId: 'price_monthly_test', userId: TEST_USER.id, email: TEST_USER.email },
    });
    expect(status).toBe(401);
    expect(stripeMock.sessions.create).not.toHaveBeenCalled();
  });

  it('checkout: rejects an invalid bearer token', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad token') });
    const { status } = await call('stripe/checkout', {
      headers: AUTH,
      body: { priceId: 'price_monthly_test' },
    });
    expect(status).toBe(401);
    expect(stripeMock.sessions.create).not.toHaveBeenCalled();
  });

  it('checkout: creates a session and immediately marks the user as trialing', async () => {
    mockAuthenticatedUser();
    // sk_test_ key in vitest config → prices must be livemode: false.
    stripeMock.prices.retrieve.mockResolvedValue({ id: 'price_monthly_test', livemode: false });
    stripeMock.sessions.create.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: TEST_USER.id, user_metadata: {} } },
      error: null,
    });
    supabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

    const { status, body } = await call('stripe/checkout', {
      headers: AUTH,
      body: {
        priceId: 'price_monthly_test',
        userId: TEST_USER.id,
        email: TEST_USER.email,
      },
    });

    expect(status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
    // Identity comes from the token, not the body.
    expect(stripeMock.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_monthly_test', quantity: 1 }],
        metadata: { supabase_user_id: TEST_USER.id },
      }),
    );
    // Immediate trial marking so the user doesn't hit a redirect loop
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      TEST_USER.id,
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          subscription_status: 'trialing',
          plan: 'Pro',
        }),
      }),
    );
  });

  it('checkout: ignores a body userId that differs from the token (no cross-account provisioning)', async () => {
    mockAuthenticatedUser();
    stripeMock.prices.retrieve.mockResolvedValue({ id: 'price_monthly_test', livemode: false });
    stripeMock.sessions.create.mockResolvedValue({ id: 'cs_test_9', url: 'https://checkout.stripe.com/c/pay/cs_test_9' });
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: TEST_USER.id, user_metadata: {} } },
      error: null,
    });
    supabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

    const victimId = '00000000-0000-4000-8000-000000009999';
    const { status } = await call('stripe/checkout', {
      headers: AUTH,
      body: { priceId: 'price_monthly_test', userId: victimId, email: 'victim@example.com' },
    });

    expect(status).toBe(200);
    // The session (and the trialing write) must target the TOKEN user only.
    expect(stripeMock.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { supabase_user_id: TEST_USER.id } }),
    );
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      TEST_USER.id,
      expect.anything(),
    );
  });

  it('checkout: rejects a price whose livemode mismatches the key mode (400, actionable)', async () => {
    mockAuthenticatedUser();
    // sk_test_ key (vitest config) + a LIVE price → must be rejected before
    // the session is created.
    stripeMock.prices.retrieve.mockResolvedValue({ id: 'price_live', livemode: true });

    const { status, body } = await call('stripe/checkout', {
      headers: AUTH,
      body: {
        priceId: 'price_live',
        userId: TEST_USER.id,
        email: TEST_USER.email,
      },
    });

    expect(status).toBe(400);
    expect(body.error).toContain('mode mismatch');
    expect(stripeMock.sessions.create).not.toHaveBeenCalled();
  });

  it('checkout: rejects a price the key cannot retrieve (400, actionable)', async () => {
    mockAuthenticatedUser();
    // e.g. a test price queried with a live key → Stripe raises "no such price".
    stripeMock.prices.retrieve.mockRejectedValue(new Error('No such price'));

    const { status, body } = await call('stripe/checkout', {
      headers: AUTH,
      body: {
        priceId: 'price_does_not_exist_here',
        userId: TEST_USER.id,
        email: TEST_USER.email,
      },
    });

    expect(status).toBe(400);
    expect(body.error).toContain('Checkout price check failed');
    expect(stripeMock.sessions.create).not.toHaveBeenCalled();
  });

  it('checkout: surfaces Stripe errors as 500', async () => {
    mockAuthenticatedUser();
    // Guard passes (matching test mode) — the session-create error is what
    // must surface as 500.
    stripeMock.prices.retrieve.mockResolvedValue({ id: 'price_bogus', livemode: false });
    stripeMock.sessions.create.mockRejectedValue(new Error('No such price: price_bogus'));

    const { status, body } = await call('stripe/checkout', {
      headers: AUTH,
      body: { priceId: 'price_bogus', userId: TEST_USER.id, email: TEST_USER.email },
    });

    expect(status).toBe(500);
    expect(body.error).toContain('No such price');
  });

  it('portal: requires authentication', async () => {
    const { status } = await call('stripe/portal', { body: { customerId: 'cus_123' } });
    expect(status).toBe(401);
    expect(stripeMock.portalSessions.create).not.toHaveBeenCalled();
  });

  it('portal: rejects a customer that is neither in metadata nor email-matched (403)', async () => {
    mockAuthenticatedUser({ ...TEST_USER, user_metadata: {} });
    stripeMock.customers = { retrieve: vi.fn().mockResolvedValue({ id: 'cus_other', deleted: false, email: 'someoneelse@example.com' }) };

    const { status } = await call('stripe/portal', {
      headers: AUTH,
      body: { customerId: 'cus_other' },
    });
    expect(status).toBe(403);
    expect(stripeMock.portalSessions.create).not.toHaveBeenCalled();
  });

  it('portal: allows the customer recorded on the caller metadata and returns the URL', async () => {
    mockAuthenticatedUser({ ...TEST_USER, user_metadata: { stripe_customer_id: 'cus_mine' } });
    stripeMock.customers = { retrieve: vi.fn() };
    stripeMock.portalSessions.create.mockResolvedValue({ id: 'bps_1', url: 'https://billing.stripe.com/session/bps_1' });

    const { status, body } = await call('stripe/portal', {
      headers: AUTH,
      body: { customerId: 'cus_mine' },
    });
    expect(status).toBe(200);
    expect(body.url).toBe('https://billing.stripe.com/session/bps_1');
    expect(stripeMock.portalSessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_mine' }));
  });

  it('webhook: checkout.session.completed provisions the subscription and emails the buyer', async () => {
    const event = {
      id: 'evt_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          object: 'checkout.session',
          metadata: { supabase_user_id: '00000000-0000-4000-8000-000000000001' },
          customer: 'cus_123',
          subscription: 'sub_123',
          customer_details: { email: 'buyer@example.com', name: 'Buyer' },
          amount_total: 799,
          currency: 'usd',
        },
      },
    };

    mockLedgerFresh();
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      trial_end: null,
      current_period_end: 2_000_000_000,
    });
    // The handler merges into existing metadata (updateUserById replaces
    // wholesale) — the mock user carries a staff role + display fields that
    // must survive provisioning.
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: {
        email: 'buyer@example.com',
        app_metadata: { role: 'admin' },
        user_metadata: { full_name: 'Buyer', avatar_url: 'https://example.com/a.png', onboarding_completed: true },
      } },
      error: null,
    });
    supabase.auth.admin.updateUserById.mockResolvedValue({ error: null });
    resendMock.emails.send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    const res = webhookRes();
    await webhookHandler(
      {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=valid' },
        body: JSON.stringify(event),
      } as any,
      res as any,
    );

    expect(res.state.status).toBe(200);
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expect.objectContaining({
        app_metadata: expect.objectContaining({
          role: 'admin',
          subscription_status: 'active',
        }),
        user_metadata: expect.objectContaining({
          stripe_customer_id: 'cus_123',
          stripe_subscription_id: 'sub_123',
          subscription_status: 'active',
          plan: 'Pro',
          full_name: 'Buyer',
          avatar_url: 'https://example.com/a.png',
          onboarding_completed: true,
        }),
      }),
    );
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
    expect(resendMock.emails.send).toHaveBeenCalledTimes(1);
  });

  it('webhook: subscription.deleted downgrades the user to Starter', async () => {
    const event = {
      id: 'evt_2',
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          metadata: { supabase_user_id: '00000000-0000-4000-8000-000000000001' },
          current_period_end: 2_000_000_000,
        },
      },
    };

    mockLedgerFresh();
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    supabase.auth.admin.updateUserById.mockResolvedValue({ error: null });
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { email: 'buyer@example.com', user_metadata: { full_name: 'Buyer' } } },
      error: null,
    });
    resendMock.emails.send.mockResolvedValue({ data: { id: 'email_2' }, error: null });

    const res = webhookRes();
    await webhookHandler(
      { method: 'POST', headers: { 'stripe-signature': 't=1,v1=valid' }, body: JSON.stringify(event) } as any,
      res as any,
    );

    expect(res.state.status).toBe(200);
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          subscription_status: 'canceled',
          plan: 'Starter',
        }),
      }),
    );
  });

  it('webhook: trial_will_end emails the user but changes no plan state', async () => {
    const event = {
      id: 'evt_4',
      object: 'event',
      type: 'customer.subscription.trial_will_end',
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          metadata: { supabase_user_id: '00000000-0000-4000-8000-000000000001' },
          trial_end: 2_000_000_000,
        },
      },
    };

    mockLedgerFresh();
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { email: 'buyer@example.com', user_metadata: { full_name: 'Buyer' } } },
      error: null,
    });
    resendMock.emails.send.mockResolvedValue({ data: { id: 'email_4' }, error: null });

    const res = webhookRes();
    await webhookHandler(
      { method: 'POST', headers: { 'stripe-signature': 't=1,v1=valid' }, body: JSON.stringify(event) } as any,
      res as any,
    );

    expect(res.state.status).toBe(200);
    // Informational event — must not touch subscription/plan state.
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
    // But it should send the trial-ending reminder.
    expect(resendMock.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        subject: expect.stringContaining('trial ends'),
      }),
    );
  });

  it('webhook: ignores event types it does not handle', async () => {
    mockLedgerFresh();
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_3',
      object: 'event',
      type: 'ping',
      data: { object: {} },
    });

    const res = webhookRes();
    await webhookHandler(
      { method: 'POST', headers: { 'stripe-signature': 't=1,v1=valid' }, body: JSON.stringify({ type: 'ping' }) } as any,
      res as any,
    );

    expect(res.state.status).toBe(200);
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(resendMock.emails.send).not.toHaveBeenCalled();
  });

  it('webhook: duplicate delivery short-circuits without reprocessing', async () => {
    // Ledger says this event was already processed.
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { event_id: 'evt_dup' } }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    supabase.from.mockReturnValue(chain);
    const event = {
      id: 'evt_dup',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { metadata: { supabase_user_id: TEST_USER.id } } },
    };
    stripeMock.webhooks.constructEvent.mockReturnValue(event);

    const res = webhookRes();
    await webhookHandler(
      { method: 'POST', headers: { 'stripe-signature': 't=1,v1=valid' }, body: JSON.stringify(event) } as any,
      res as any,
    );

    expect(res.state.status).toBe(200);
    expect(res.state.body).toEqual({ received: true, duplicate: true });
    // No provisioning, no emails, no ledger insert on a duplicate.
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(resendMock.emails.send).not.toHaveBeenCalled();
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('webhook: payment_failed records dunning state without downgrading the plan', async () => {
    mockLedgerFresh();
    const event = {
      id: 'evt_fail_1',
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_1',
          object: 'invoice',
          subscription: 'sub_123',
          amount_due: 799,
          currency: 'usd',
          created: 1_750_000_000,
        },
      },
    };
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'past_due',
      metadata: { supabase_user_id: TEST_USER.id },
    });
    // Prior state: active subscriber, one prior failure already recorded.
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: TEST_USER.id, email: TEST_USER.email, user_metadata: { payment_failure_count: 1 } } },
      error: null,
    });
    supabase.auth.admin.updateUserById.mockResolvedValue({ error: null });
    resendMock.emails.send.mockResolvedValue({ data: { id: 'email_f' }, error: null });

    const res = webhookRes();
    await webhookHandler(
      { method: 'POST', headers: { 'stripe-signature': 't=1,v1=valid' }, body: JSON.stringify(event) } as any,
      res as any,
    );

    expect(res.state.status).toBe(200);
    // Dunning: status flips to past_due, failure count increments, but the
    // plan stays Pro during the grace window.
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      TEST_USER.id,
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          subscription_status: 'past_due',
          payment_failure_count: 2,
        }),
      }),
    );
    const meta = supabase.auth.admin.updateUserById.mock.calls[0][1].user_metadata;
    expect(meta.plan).toBeUndefined();
    expect(meta.last_payment_failure_at).toBeTruthy();
    expect(resendMock.emails.send).toHaveBeenCalledTimes(1);
  });

  it('webhook: payment_succeeded resets the dunning counters', async () => {
    mockLedgerFresh();
    const event = {
      id: 'evt_ok_1',
      object: 'event',
      type: 'invoice.payment_succeeded',
      data: {
        object: { id: 'in_2', object: 'invoice', subscription: 'sub_123', amount_paid: 799, currency: 'usd' },
      },
    };
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      metadata: { supabase_user_id: TEST_USER.id },
    });
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: TEST_USER.id, email: TEST_USER.email, user_metadata: {} } },
      error: null,
    });
    supabase.auth.admin.updateUserById.mockResolvedValue({ error: null });
    resendMock.emails.send.mockResolvedValue({ data: { id: 'email_s' }, error: null });

    const res = webhookRes();
    await webhookHandler(
      { method: 'POST', headers: { 'stripe-signature': 't=1,v1=valid' }, body: JSON.stringify(event) } as any,
      res as any,
    );

    expect(res.state.status).toBe(200);
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      TEST_USER.id,
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          subscription_status: 'active',
          plan: 'Pro',
          payment_failure_count: 0,
          last_payment_failure_at: null,
        }),
      }),
    );
  });
});
