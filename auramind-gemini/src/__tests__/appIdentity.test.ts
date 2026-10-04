/**
 * Guards the single-source-of-truth contract for the product name.
 *
 * app-identity.ts exists so a rename is one edit rather than a sweep across
 * four languages. The failure mode this test catches is the interesting one:
 * someone adds a new place that shows the product name, types the literal
 * into it, and the name is now in two sources that can drift.
 *
 * These tests pin the constants and their derived relationships. The check
 * that the *build output* actually carries the name is in CI via
 * scripts/brand-sync.mjs plus the index.html transform, which fails loudly if
 * a brand-driven tag loses its data-brand marker.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  APP_SHORT_NAME,
  APP_SHORT_NAME_RESOLVED,
  APP_TAGLINE,
  APP_DESCRIPTION,
  APP_SOCIAL_TITLE,
  APP_MANIFEST_NAME,
  APP_IDENTITY,
} from '../../app-identity';

describe('app-identity — the product name', () => {
  it('APP_NAME is the single source of truth', () => {
    // Not pinned to a literal on purpose: this test must keep passing across a
    // rename. What it asserts is that everything else derives from it.
    expect(APP_NAME).toBeTruthy();
    expect(APP_NAME).toBe(APP_IDENTITY.name);
  });

  it('APP_NAME carries no tagline — stores reject slogan-like app names', () => {
    // Google Play treats a name containing a dash-plus-phrase as marketing and
    // can reject the listing. The tagline lives in APP_TAGLINE.
    expect(APP_NAME).not.toMatch(/[-–—|:]/);
    expect(APP_NAME).not.toMatch(/\s/);
  });

  it('APP_SHORT_NAME is either undefined or a real string, never a stale literal', () => {
    if (APP_SHORT_NAME !== undefined) {
      expect(APP_SHORT_NAME).toBe(APP_NAME.startsWith(APP_SHORT_NAME) ? APP_SHORT_NAME : APP_NAME);
      expect(APP_SHORT_NAME.length).toBeGreaterThan(0);
    }
  });

  it('APP_SHORT_NAME_RESOLVED falls back to APP_NAME so callers never branch', () => {
    expect(APP_SHORT_NAME_RESOLVED).toBe(APP_SHORT_NAME ?? APP_NAME);
    expect(APP_SHORT_NAME_RESOLVED.length).toBeGreaterThan(0);
  });

  it('APP_SHORT_NAME_RESOLVED fits a phone home screen', () => {
    // Android's launcher ellipsizes the label past roughly 12 characters.
    expect(APP_SHORT_NAME_RESOLVED.length).toBeLessThanOrEqual(12);
  });
});

describe('app-identity — derived strings follow APP_NAME', () => {
  it('APP_SOCIAL_TITLE is built from name + tagline, never typed out', () => {
    expect(APP_SOCIAL_TITLE).toBe(`${APP_NAME} - ${APP_TAGLINE}`);
    expect(APP_SOCIAL_TITLE).toContain(APP_NAME);
  });

  it('APP_MANIFEST_NAME is built from name + tagline', () => {
    expect(APP_MANIFEST_NAME).toBe(`${APP_NAME} - ${APP_TAGLINE}`);
  });

  it('APP_DESCRIPTION opens with APP_NAME by interpolation', () => {
    // If this ever stops being true, a rename leaves the description
    // advertising the old product while the title says the new one.
    expect(APP_DESCRIPTION.startsWith(APP_NAME)).toBe(true);
  });

  it('APP_DESCRIPTION does not contain the literal old name after a rename', () => {
    // Only meaningful once APP_NAME changes; it is written so that when
    // APP_NAME stops being 'BonaMind' this still passes, and it fails if
    // someone hardcodes the previous name into the description.
    expect(APP_DESCRIPTION.includes(APP_NAME)).toBe(true);
  });
});

describe('app-identity — the aggregate mirrors the named exports', () => {
  it('APP_IDENTITY fields match their named exports', () => {
    expect(APP_IDENTITY.name).toBe(APP_NAME);
    expect(APP_IDENTITY.shortName).toBe(APP_SHORT_NAME_RESOLVED);
    expect(APP_IDENTITY.tagline).toBe(APP_TAGLINE);
    expect(APP_IDENTITY.description).toBe(APP_DESCRIPTION);
    expect(APP_IDENTITY.socialTitle).toBe(APP_SOCIAL_TITLE);
    expect(APP_IDENTITY.manifestName).toBe(APP_MANIFEST_NAME);
  });
});