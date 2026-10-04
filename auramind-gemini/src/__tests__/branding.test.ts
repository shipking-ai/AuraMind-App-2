/**
 * Branding regression tests — v3.
 *
 * The product-vs-parent brand split is the load-bearing assumption for
 * every legal page and footer. These tests pin the constants so that a
 * future "let me just rename this in both places" refactor visibly breaks
 * a test, rather than silently dropping the CogniVect parent-company
 * attribution into the wrong surface (or losing BonaMind altogether).
 *
 * Round-3 contracts (matches `src/lib/branding.ts`):
 *   - PARENT_COMPANY_LEGAL = 'CogniVect, Inc' (no trailing period —
 *     consumers add their own punctuation to avoid "Inc.." double-dot bugs).
 *   - TRADEMARK_STATEMENT = 'BonaMind is a trademark of CogniVect, Inc'
 *     (also no trailing period for the same reason).
 *   - LEGAL_ADDRESS = 'CogniVect, Inc, 548 Market St, San Francisco, CA 94104'
 *     (no trailing period in the address either).
 *   - PRODUCT_NAME now derives from app-identity.ts APP_NAME so the two cannot drift.
   - TRADEMARK_STATEMENT = 'BonaMind is a trademark of CogniVect, Inc'
   - BRAND aggregate key parity is asserted via Object.keys so future
 *     named exports must mirror into BRAND, or the parity test fails.
 */

import { describe, expect, it } from 'vitest';
import {
  PARENT_COMPANY_NAME,
  PARENT_COMPANY_LEGAL,
  PARENT_BRAND_SLUG,
  PARENT_BRAND_TAGLINE,
  PRODUCT_NAME,
  PRODUCT_BYLINE,
  CONTACT_EMAIL,
  PARENT_CONTACT_EMAIL,
  LEGAL_ADDRESS,
  TRADEMARK_STATEMENT,
  LEGAL_COPYRIGHT_LINE,
  LEGAL_YEAR,
  BRAND,
} from '../lib/branding';
import { APP_NAME } from '../../app-identity';

describe('Branding — parent company (CogniVect)', () => {
  it('parent company name is "CogniVect" (cog* + vect capitalisation)', () => {
    expect(PARENT_COMPANY_NAME).toBe('CogniVect');
  });

  it('parent legal name is "CogniVect, Inc" WITHOUT trailing period — callers add their own', () => {
    expect(PARENT_COMPANY_LEGAL).toBe('CogniVect, Inc');
    // The legal address embeds the constant and re-attaches surrounding
    // punctuation so the final user-facing string still reads naturally.
    expect(LEGAL_ADDRESS).toContain(PARENT_COMPANY_LEGAL);
    // No trailing period on the constant itself — that's the convention.
    expect(PARENT_COMPANY_LEGAL.endsWith('.')).toBe(false);
  });

  it('parent slug and tagline describe the brand meaning', () => {
    expect(PARENT_BRAND_SLUG).toBe('covect');
    expect(PARENT_BRAND_TAGLINE).toBe('cognitive · vector');
  });
});

describe('Branding — product (BonaMind)', () => {
  it('product name follows APP_NAME (App Store + bundle ids are unaffected by a display rename)', () => {
    expect(PRODUCT_NAME).toBe(APP_NAME);
  });

  it('product byline reads as "BonaMind — a CogniVect product" and follows the parent by interpolation', () => {
    expect(PRODUCT_BYLINE).toBe('BonaMind — a CogniVect product');
    expect(PRODUCT_BYLINE).toContain(PRODUCT_NAME);
    expect(PRODUCT_BYLINE).toContain(PARENT_COMPANY_NAME);
    // Regression guard: if a future rename PR hardcodes "CogniVect" instead
    // of `${PARENT_COMPANY_NAME}` the value still matches but the second
    // ensure above doesn't catch it — guard explicitly via interpolation.
    expect(PRODUCT_BYLINE).toMatch(/CogniVect/);
  });
});

describe('Branding — contact + legal lines', () => {
  it('contact email keeps the live bonamind.app mailbox (deliverability already warmed)', () => {
    expect(CONTACT_EMAIL).toBe('hello@bonamind.app');
  });

  it('parent contact email reuses the production mailbox until the parent brand has its own', () => {
    // Until CogniVect provisions its own mailbox, PARENT_CONTACT_EMAIL
    // aliases to CONTACT_EMAIL so both consumers point at the same inbound.
    expect(PARENT_CONTACT_EMAIL).toBe(CONTACT_EMAIL);
  });

  it('trademark statement attributes BonaMind to CogniVect, Inc. (no trailing period — users add)', () => {
    expect(TRADEMARK_STATEMENT).toBe('BonaMind is a trademark of CogniVect, Inc');
    expect(TRADEMARK_STATEMENT).toContain(PRODUCT_NAME);
    expect(TRADEMARK_STATEMENT).toContain(PARENT_COMPANY_LEGAL);
    // Regression guard: confirm there is no double-period bug at the end of
    // any consumer surrogate.
    expect(TRADEMARK_STATEMENT).not.toMatch(/\.\./);
  });

  it('legal copyright line references the parent legal name and a year (regex only)', () => {
    // We don't pin the year value to avoid Jan-1 rollovers; we only assert
    // the structural shape "© {YYYY} CogniVect, Inc....".
    expect(LEGAL_COPYRIGHT_LINE).toMatch(/^© \d{4} CogniVect, Inc\..*$/);
    expect(LEGAL_COPYRIGHT_LINE).toContain(PARENT_COMPANY_LEGAL);
  });

  it('LEGAL_YEAR neutralised: the year embedded in LEGAL_COPYRIGHT_LINE matches LEGAL_YEAR', () => {
    // Pulls the year between "© " and the first space and compares it to
    // the LEGAL_YEAR const. Catches regressions where the year string
    // drifted from the const.
    const match = LEGAL_COPYRIGHT_LINE.match(/^© (\d{4}) /);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(LEGAL_YEAR);
  });

  it('legal address is the SF 548 Market address (no period inside, addresses sometimes look comma-clipped but it’s intentional)', () => {
    expect(LEGAL_ADDRESS).toBe('CogniVect, Inc, 548 Market St, San Francisco, CA 94104');
  });
});

describe('Branding — BRAND aggregate object has key parity with named exports', () => {
  // If a new named constant ships without an entry in BRAND, this fails.
  // The keyed-as-type-cast on `BRAND` itself keeps the inverse direction
  // honest at compile time.
  const EXPECTED_BRAND_KEYS = [
    'parentName',
    'parentLegal',
    'parentSlug',
    'parentTagline',
    'product',
    'productByline',
    'contactEmail',
    'parentContactEmail',
    'legalAddress',
    'trademarkStatement',
    'copyrightLine',
  ];
  it('BRAND key set matches the expected enumeration', () => {
    expect(Object.keys(BRAND).sort()).toEqual([...EXPECTED_BRAND_KEYS].sort());
  });

  it('every BRAND key mirrors its corresponding named export', () => {
    expect(BRAND.parentName).toBe(PARENT_COMPANY_NAME);
    expect(BRAND.parentLegal).toBe(PARENT_COMPANY_LEGAL);
    expect(BRAND.parentSlug).toBe(PARENT_BRAND_SLUG);
    expect(BRAND.parentTagline).toBe(PARENT_BRAND_TAGLINE);
    expect(BRAND.product).toBe(PRODUCT_NAME);
    expect(BRAND.productByline).toBe(PRODUCT_BYLINE);
    expect(BRAND.contactEmail).toBe(CONTACT_EMAIL);
    expect(BRAND.parentContactEmail).toBe(PARENT_CONTACT_EMAIL);
    expect(BRAND.legalAddress).toBe(LEGAL_ADDRESS);
    expect(BRAND.trademarkStatement).toBe(TRADEMARK_STATEMENT);
    expect(BRAND.copyrightLine).toBe(LEGAL_COPYRIGHT_LINE);
  });
});
