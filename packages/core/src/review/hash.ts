/**
 * Slice 2 (docs/slice2-plan.md sections 2.2 and 4.3): the hashes of the review model. Core has no crypto (the webview
 * bundles it, with no Node or DOM typings), so SHA-256 is written out here (FIPS 180-4), over the UTF-8 bytes of a
 * string, and the canonical JSON it hashes sorts object keys, so a content key never depends on property order.
 */
import { utf8Bytes } from '../markup/ids.js';

const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

/** SHA-256 of the UTF-8 bytes of `text`, as 64 lower-case hex digits. */
export function sha256Hex(text: string): string {
  const bytes = utf8Bytes(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  bytes.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff);
  bytes.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w: number[] = new Array<number>(64).fill(0);
  const at = (list: readonly number[], i: number) => list[i] ?? 0;
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let t = 0; t < 16; t++) {
      const i = offset + t * 4;
      w[t] = ((at(bytes, i) << 24) | (at(bytes, i + 1) << 16) | (at(bytes, i + 2) << 8) | at(bytes, i + 3)) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const w15 = at(w, t - 15);
      const w2 = at(w, t - 2);
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[t] = (at(w, t - 16) + s0 + at(w, t - 7) + s1) >>> 0;
    }
    let a = at(h, 0);
    let b = at(h, 1);
    let c = at(h, 2);
    let d = at(h, 3);
    let e = at(h, 4);
    let f = at(h, 5);
    let g = at(h, 6);
    let hh = at(h, 7);
    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + at(K, t) + at(w, t)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (at(h, 0) + a) >>> 0;
    h[1] = (at(h, 1) + b) >>> 0;
    h[2] = (at(h, 2) + c) >>> 0;
    h[3] = (at(h, 3) + d) >>> 0;
    h[4] = (at(h, 4) + e) >>> 0;
    h[5] = (at(h, 5) + f) >>> 0;
    h[6] = (at(h, 6) + g) >>> 0;
    h[7] = (at(h, 7) + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}

/**
 * Canonical JSON: object keys sorted (UTF-16 code-unit order), `undefined` members left out, no whitespace. Arrays keep
 * their order (callers sort what is a set).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalJson: a number that is not finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
  }
  throw new Error(`canonicalJson: cannot encode a ${typeof value}`);
}

/** SHA-256 hex of a value's canonical JSON. */
export function hashOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * An item record's id (§2.2, AF7, D2-31): `it` and the first 16 hex digits of the sha256 of the run id and the key.
 * One record per key, so an id is never reused in a session, and it never depends on how many other items exist.
 */
export function reviewItemId(runId: string, key: string): string {
  return `it${hashOf([runId, key]).slice(0, 16)}`;
}
