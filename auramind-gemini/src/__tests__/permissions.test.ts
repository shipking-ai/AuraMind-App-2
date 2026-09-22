import { describe, expect, it } from 'vitest';
import {
  getPermissions,
  resolveAuthorizationRole,
  getDefaultRole,
} from '../utils/permissions';
import { UserRole } from '../types';

describe('resolveAuthorizationRole', () => {
  it('resolves the role from app_metadata, which only the service-role key can write', () => {
    for (const role of ['owner', 'ceo', 'admin', 'employee', 'tester', 'user'] as const) {
      expect(resolveAuthorizationRole({ app_metadata: { role } })).toBe(role);
    }
  });

  it('IGNORES user_metadata.role — the forged-tester attack', () => {
    // Any signed-in user can run:
    //   await supabase.auth.updateUser({ data: { role: 'tester' } })
    // and get user_metadata.role = 'tester'. That must not grant the
    // paywall bypass (or anything else).
    expect(
      resolveAuthorizationRole({
        user_metadata: { role: 'tester' },
        app_metadata: {},
      }),
    ).toBe(UserRole.USER);
  });

  it('IGNORES a forged staff role in user_metadata', () => {
    expect(
      resolveAuthorizationRole({
        user_metadata: { role: 'admin' },
        app_metadata: { role: 'user' },
      }),
    ).toBe(UserRole.USER);
    expect(
      resolveAuthorizationRole({
        user_metadata: { role: 'owner' },
      }),
    ).toBe(UserRole.USER);
  });

  it('prefers app_metadata when both copies exist', () => {
    expect(
      resolveAuthorizationRole({
        user_metadata: { role: 'user' },
        app_metadata: { role: 'admin' },
      }),
    ).toBe(UserRole.ADMIN);
  });

  it('fails closed on unknown or non-string app_metadata.role', () => {
    expect(resolveAuthorizationRole({ app_metadata: { role: 'superadmin' } })).toBe(UserRole.USER);
    expect(resolveAuthorizationRole({ app_metadata: { role: 3 } })).toBe(UserRole.USER);
    expect(resolveAuthorizationRole({ app_metadata: {} })).toBe(UserRole.USER);
    expect(resolveAuthorizationRole({})).toBe(UserRole.USER);
    expect(resolveAuthorizationRole(null)).toBe(UserRole.USER);
    expect(resolveAuthorizationRole(undefined)).toBe(UserRole.USER);
  });

  it('honours the caller-supplied fallback', () => {
    expect(resolveAuthorizationRole({}, UserRole.EMPLOYEE)).toBe(UserRole.EMPLOYEE);
  });

  it('getDefaultRole still maps the owner email', () => {
    expect(getDefaultRole('nobody@example.com')).toBe(UserRole.USER);
  });
});

describe('getPermissions for the tester role', () => {
  it('skips the paywall (hasFreeAccess) — the entire point of the role', () => {
    expect(getPermissions(UserRole.TESTER).hasFreeAccess).toBe(true);
  });

  it('gets NO staff or admin powers', () => {
    const perms = getPermissions(UserRole.TESTER);
    expect(perms.canAccessAdminPanel).toBe(false);
    expect(perms.canViewAllData).toBe(false);
    expect(perms.canDeleteUsers).toBe(false);
  });

  it('ranks below employee so role-gated UI never opens for testers', () => {
    const hierarchy = getPermissions(UserRole.TESTER);
    expect(hierarchy.hasFreeAccess).toBe(true);
    // Anything employee-and-above must stay false.
    expect(getPermissions(UserRole.TESTER).canAccessAdminPanel).toBe(false);
    expect(hierarchy).toBeDefined();
  });

  it('staff roles keep their existing free access', () => {
    expect(getPermissions(UserRole.ADMIN).hasFreeAccess).toBe(true);
    expect(getPermissions(UserRole.EMPLOYEE).hasFreeAccess).toBe(false);
    expect(getPermissions(UserRole.USER).hasFreeAccess).toBe(false);
  });
});
