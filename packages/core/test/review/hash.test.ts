/**
 * Slice 2a1 (docs/slice2-plan.md 2.2, 4.3): core's SHA-256 (core has no crypto), canonical JSON and item ids. The
 * reference digests were computed with Node's `crypto` (outside core).
 */
import { describe, expect, it } from 'vitest';
import { RUN_TOKEN_PATTERN } from '../../src/protocol.js';
import { canonicalJson, hashOf, reviewItemId, sha256Hex } from '../../src/review/hash.js';

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 vectors and Node over UTF-8, at every padding boundary', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex('“T” ← ∀ x, 𝔽 x')).toBe('7c3088afa824a5889a94463e9d3f8cda13b9106c6cd4228eedbd876edaa9cf1c');
    expect(sha256Hex('a'.repeat(55))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
    expect(sha256Hex('a'.repeat(56))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a');
    expect(sha256Hex('a'.repeat(64))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
});

describe('canonicalJson', () => {
  it('sorts object keys at every depth, drops undefined members and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: undefined, b: 'x' } })).toBe('{"a":{"b":"x","d":[3,1]},"b":1}');
    expect(hashOf({ x: 1, y: [1, 2] })).toBe(hashOf({ y: [1, 2], x: 1 }));
    expect(hashOf({ y: [2, 1] })).not.toBe(hashOf({ y: [1, 2] }));
  });
});

describe('reviewItemId (AF7, D2-31)', () => {
  it('is `it` and 16 hex digits of the sha256 of the run id and the key, a run token, and nothing else counts', () => {
    expect(reviewItemId('run1', 'card:x')).toBe('it28a92e030e357d5d');
    expect(RUN_TOKEN_PATTERN.test(reviewItemId('run1', 'premise:t:a_b'))).toBe(true);
    expect(reviewItemId('run1', 'card:x')).not.toBe(reviewItemId('run2', 'card:x'));
    expect(reviewItemId('run1', 'card:x')).not.toBe(reviewItemId('run1', 'card:y'));
  });
});
