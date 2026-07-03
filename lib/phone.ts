import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Normalize a raw phone string to bare E.164 digits (no `+`, no spaces),
 * suitable for building a `wa.me/<number>` link AND for dedupe matching
 * (spec 005 US3 + US6 — this helper is reused by intake dedupe and backfill,
 * so correctness is load-bearing).
 *
 * HelioMax operates in BOTH Egypt and Saudi Arabia, so a naive "try EG then SA"
 * is WRONG: the KSA local mobile `0501234567` is (incorrectly) accepted as an
 * Egyptian number and mangled to `+20…`. We therefore disambiguate by the
 * LOCAL prefix before falling back to a validity probe, biasing SA on genuine
 * ambiguity (Riyadh is the current growth market).
 *
 * Rules:
 *   1. Trim; strip spaces, dashes, parentheses.
 *   2. Leading `+`      → parse as international as-is.
 *   3. Leading `00`     → replace with `+` and parse as international.
 *   4. National/local   → pick country by prefix:
 *        - `05` + 10 digits  → SA   (0501234567    → 966501234567)
 *        - `01` + 11 digits  → EG   (01012345678   → 201012345678)
 *        - `5`  + 9  digits  → SA   (missing leading 0)
 *        - `1`  + 10 digits  → EG   (missing leading 0)
 *        - otherwise         → try SA then EG, first valid wins.
 *   5. Return E.164 digits WITHOUT the leading `+`, or `null` if unparseable.
 *
 * Inline tests:
 *   normalizePhone('0501234567')      -> '966501234567'   (SA local)
 *   normalizePhone('01012345678')     -> '201012345678'   (EG local)
 *   normalizePhone('+966 50 123 4567')-> '966501234567'
 *   normalizePhone('00201012345678')  -> '201012345678'
 *   normalizePhone('')                -> null
 *   normalizePhone('abc')             -> null
 */
export function normalizePhone(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // 1. Trim and strip spaces, dashes, parentheses (keep leading + and digits).
  const cleaned = raw.trim().replace(/[\s\-().]/g, '');
  if (!cleaned) return null;

  // 2 & 3. International forms.
  if (cleaned.startsWith('+')) {
    return toDigits(parseIntl(cleaned));
  }
  if (cleaned.startsWith('00')) {
    return toDigits(parseIntl('+' + cleaned.slice(2)));
  }

  // 4. National / local form: choose region by prefix.
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return null;

  let ordered: CountryCode[];
  if (digits.startsWith('05') && digits.length === 10) {
    ordered = ['SA'];
  } else if (digits.startsWith('01') && digits.length === 11) {
    ordered = ['EG'];
  } else if (digits.startsWith('5') && digits.length === 9) {
    ordered = ['SA'];
  } else if (digits.startsWith('1') && digits.length === 10) {
    ordered = ['EG'];
  } else {
    // Ambiguous: bias SA (current growth market), then EG.
    ordered = ['SA', 'EG'];
  }

  for (const region of ordered) {
    const parsed = parseNational(digits, region);
    if (parsed) return parsed;
  }
  return null;
}

/** Parse an already-international string (starts with '+'). */
function parseIntl(value: string): string | null {
  try {
    const parsed = parsePhoneNumberFromString(value);
    if (parsed && parsed.isValid()) return parsed.number; // E.164 with '+'
  } catch {
    /* fallthrough */
  }
  return null;
}

/** Parse a national/local string in a specific region. */
function parseNational(digits: string, region: CountryCode): string | null {
  try {
    const parsed = parsePhoneNumberFromString(digits, region);
    if (parsed && parsed.isValid()) return parsed.number; // E.164 with '+'
  } catch {
    /* fallthrough */
  }
  return null;
}

/** Strip the leading '+' → bare digits for wa.me; passes null through. */
function toDigits(e164: string | null): string | null {
  if (!e164) return null;
  return e164.replace(/^\+/, '');
}
