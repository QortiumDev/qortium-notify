import { describe, expect, it } from 'vitest';
import { getForeignPaymentPrivacyNotice } from './App';
import { createTranslator } from './i18n';

describe('getForeignPaymentPrivacyNotice', () => {
  const t = createTranslator('en');

  it('discloses the Core watch-only history and lack of spending authority for foreign-payment rules', () => {
    expect(getForeignPaymentPrivacyNotice('FOREIGN_PAYMENT_RECEIVED', t)).toBe(
      'Foreign-coin rules share a watch-only wallet view (address history, never spending) with this Core node.',
    );
  });

  it('does not add the foreign-payment disclosure to other rule types', () => {
    expect(getForeignPaymentPrivacyNotice('PAYMENT_RECEIVED', t)).toBeNull();
  });
});
