import { classifyFailure } from '../analytics';

// KAN-6 regression: classifyFailure must map an unrecognized error to the
// literal string 'unknown' and must NOT leak the raw err.message back to the
// caller (which would flow into the feature_action_failed `failure_reason`
// property). This test FAILS on the current code (which returns err.message for
// uncategorized errors) and PASSES once classifyFailure returns 'unknown'.
describe('classifyFailure — unknown category (KAN-6)', () => {
  test('returns the string "unknown" when the message matches no known validation category', () => {
    const err = new Error('a totally unexpected internal failure 9f3c-xyz that matches nothing');

    expect(classifyFailure(err)).toBe('unknown');
  });

  test('does not return the raw err.message for an uncategorized error', () => {
    const message = 'Sensitive raw failure detail 0xdeadbeef that must never be emitted verbatim';
    const err = new Error(message);

    const result = classifyFailure(err);

    expect(result).not.toBe(message);
    expect(result).toBe('unknown');
  });
});
