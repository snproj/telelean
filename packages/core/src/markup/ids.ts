/**
 * Node ids (03 section 3.1 "Rules for id"; 02 D-8): a stable slug transliterated from the sentence, with
 * `n-<6 hex>` as the fallback for text with no Latin letters or digits. Ids are never changed implicitly; a derived
 * id is written back on the next edit.
 */

/** Node ids: lower-case letters and digits in groups joined by `-`, `_` or `.` (fallback ids look like `n-3fa2c1`). */
export const ID_PATTERN = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;

/** Most words kept in a slug. */
const MAX_WORDS = 6;

/** Latin letters that Unicode does not decompose (NFKD leaves them whole), spelled out. */
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  ß: 'ss',
  ẞ: 'ss',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  ø: 'o',
  Ø: 'o',
  đ: 'd',
  Đ: 'd',
  ð: 'd',
  Ð: 'd',
  þ: 'th',
  Þ: 'th',
  ł: 'l',
  Ł: 'l',
  ı: 'i',
  ħ: 'h',
  Ħ: 'h',
  ŋ: 'ng',
  Ŋ: 'ng',
};

/**
 * The slug of a sentence: transliterated (NFKD, combining marks removed, a few undecomposable Latin letters
 * spelled out), lower-cased, every run of other characters turned into `-`, at most 6 words. Empty when the
 * sentence has no Latin letters or digits.
 */
export function slugOf(sentence: string): string {
  const latin = Array.from(sentence, (ch) => TRANSLITERATIONS[ch] ?? ch).join('');
  return latin
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '')
    .slice(0, MAX_WORDS)
    .join('-');
}

/** UTF-8 bytes of a string (lone surrogates become U+FFFD, as `TextEncoder` does). */
export function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
        i++;
      } else {
        cp = 0xfffd;
      }
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      cp = 0xfffd;
    }
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return bytes;
}

/** FNV-1a, 32 bits, over the UTF-8 bytes of `text` (core has no crypto). */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of utf8Bytes(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The fallback id for a sentence without Latin letters or digits: `n-` + the first 6 hex digits of FNV-1a 32 of the trimmed sentence. */
export function fallbackId(sentence: string): string {
  return `n-${fnv1a32(sentence.trim()).toString(16).padStart(8, '0').slice(0, 6)}`;
}

/** A stable id from the sentence (transliterated slug, at most 6 words; `n-<6 hex>` for non-Latin text), unused per `taken`. */
export function deriveId(naturalName: string, taken: (id: string) => boolean): string {
  const base = slugOf(naturalName) || fallbackId(naturalName);
  if (!taken(base)) return base;
  for (let i = 2; i < 1_000_000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error(`deriveId: every suffix of "${base}" is taken`);
}
