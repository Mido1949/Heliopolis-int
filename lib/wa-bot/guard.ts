/**
 * Last line of defence: a bot reply that breaks a company rule is never sent,
 * whatever the model was told. The conversation goes to the team instead.
 * Pure, so it is unit-tested without the network.
 */
const RULES: { pattern: RegExp; reason: string }[] = [
  // Manufacturer / partner names (same list as the website's naming test).
  { pattern: /gchv|guangdong|\bcarrier\b|hokair|heliopolis/i, reason: 'اسم ممنوع' },
  { pattern: /هليوبل(?:يس|س)|الحكير|حكير|كاريير|كارير|جوانجدونج/, reason: 'اسم ممنوع' },
  // Prices and money.
  { pattern: /\d[\d,.٬]*\s*(?:ج\.?م|جنيه|جنية|egp|le\b|usd|\$|دولار|ريال|sar)/i, reason: 'سعر' },
  { pattern: /(?:ج\.?م|جنيه|egp|usd|\$|دولار)\s*[\d٠-٩]/i, reason: 'سعر' },
  // Nothing is ever "free" (site visit price is never stated either).
  { pattern: /مجان|ببلاش|\bfree\b|من غير فلوس|بدون مقابل/i, reason: 'مجاني' },
  // Claims we cannot back.
  { pattern: /5[05]\s*°|٥[٠٥]\s*°|55\s*درج|٥٥\s*درج|iplv|ahri|1000\s*م/i, reason: 'ادعاء ممنوع' },
];

export function checkReply(text: string): { ok: true } | { ok: false; reason: string } {
  for (const r of RULES) if (r.pattern.test(text)) return { ok: false, reason: r.reason };
  return { ok: true };
}
