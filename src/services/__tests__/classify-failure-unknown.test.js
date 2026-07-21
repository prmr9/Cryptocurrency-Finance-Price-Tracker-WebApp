import { classifyFailure } from '../analytics';

// Regression test for KAN-6 acceptance criterion:
// classifyFailure(err) must return the literal string 'unknown' for an Error
// whose message matches no known validation category, and must NOT leak
// err.message back to the caller.
describe('classifyFailure — uncategorized errors (KAN-6)', () => {
  it('returns "unknown" for an Error message that matches no known category', () => {
    const message = 'zqxjk totally-unrecognized-failure 9271 sprocket flux';
    const err = new Error(message);

    const result = classifyFailure(err);

    // The bug: current code returns err.message (leaking raw text) instead of 'unknown'.
    expect(result).not.toBe(message);
    expect(result).toBe('unknown');
  });

  it('does not echo the raw message for a differently-worded unknown error', () => {
    const message = 'wibble wobble unmatchable condition xyzzy';
    const err = new Error(message);

    const result = classifyFailure(err);

    expect(result).not.toBe(message);
    expect(result).not.toContain('wibble');
    expect(result).toBe('unknown');
  });
});
