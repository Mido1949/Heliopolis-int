# -*- coding: utf-8 -*-
"""
Free EN->AR translation engine (no API key, no credits).

Uses the public Chrome-extension translate endpoint, with:
  * abbreviation protection  - EBIT/WACC/ROI... are swapped for inert placeholders
    before translation and restored afterwards, because the engine otherwise
    expands EBIT into the EBITDA definition (a real accounting error).
  * batching                 - many blocks per HTTP request, under a char budget
  * backoff + fallback       - exponential retry, then MyMemory per block
  * glossary parentheticals  - canonical Arabic term followed by the English one
                               on first use inside a block
"""
import json
import re
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
ENDPOINT = "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ar&"
CHAR_BUDGET = 3800
MAX_Q = 20

# Abbreviations that must survive verbatim. Longest first so EBITDA wins over EBIT.
ABBREV = sorted([
    "EBITDA", "EBIT", "EBT", "WACC", "CAPM", "NPV", "IRR", "MIRR", "ROI", "ROE", "ROA",
    "ROIC", "RONA", "EPS", "P/E", "PEG", "EVA", "MVA", "DOL", "DFL", "DTL", "COGS",
    "CAPEX", "OPEX", "FIFO", "LIFO", "GAAP", "IFRS", "SEC", "FASB", "IMA", "CMA",
    "COSO", "ERM", "SWOT", "BCG", "JIT", "TQM", "ERP", "MRP", "EOQ", "CVP", "ABC",
    "BEP", "NOPAT", "FCF", "CFO", "CFF", "CFI", "DSO", "DPO", "DIO", "CCC",
    "LBO", "IPO", "M&A", "CAGR", "YTM", "YTC", "APR", "APY", "LIBOR", "SOFR",
    "T-bill", "OTC", "ADR", "GDR", "REIT", "ETF", "NAV", "AR", "AP",
], key=len, reverse=True)

# English term -> canonical Arabic. Used only to APPEND the English term in
# parentheses when the engine already produced the canonical Arabic; never to
# rewrite the translation.
GLOSSARY = {
    "financial leverage": "الرافعة المالية",
    "operating leverage": "الرافعة التشغيلية",
    "capital structure": "هيكل رأس المال",
    "working capital": "رأس المال العامل",
    "cost of capital": "تكلفة رأس المال",
    "solvency": "الملاءة",
    "liquidity": "السيولة",
    "equity": "حقوق الملكية",
    "retained earnings": "الأرباح المحتجزة",
    "treasury stock": "أسهم الخزينة",
    "preferred stock": "الأسهم الممتازة",
    "common stock": "الأسهم العادية",
    "convertible bond": "السندات القابلة للتحويل",
    "covenant": "التعهدات",
    "default": "التعثر",
    "depreciation": "الإهلاك",
    "amortization": "الاستهلاك",
    "accrual": "الاستحقاق",
    "deferred tax": "الضريبة المؤجلة",
    "gross margin": "هامش الربح الإجمالي",
    "contribution margin": "هامش المساهمة",
    "break-even point": "نقطة التعادل",
    "variance analysis": "تحليل الانحرافات",
    "standard cost": "التكلفة المعيارية",
    "flexible budget": "الموازنة المرنة",
    "master budget": "الموازنة الشاملة",
    "transfer pricing": "التسعير التحويلي",
    "activity-based costing": "التكلفة على أساس الأنشطة",
    "opportunity cost": "تكلفة الفرصة البديلة",
    "sunk cost": "التكلفة الغارقة",
    "relevant cost": "التكلفة الملائمة",
    "present value": "القيمة الحالية",
    "future value": "القيمة المستقبلية",
    "discount rate": "معدل الخصم",
    "hurdle rate": "معدل العائد المطلوب",
    "payback period": "فترة الاسترداد",
    "internal control": "الرقابة الداخلية",
    "risk management": "إدارة المخاطر",
    "hedging": "التحوط",
    "derivative": "المشتقات",
    "forward contract": "العقود الآجلة",
    "letter of credit": "خطاب الاعتماد",
    "factoring": "تحويل الذمم المدينة",
    "securitization": "التوريق",
}


def protect(text):
    """Swap abbreviations for inert placeholders. Returns (masked_text, mapping)."""
    mapping = {}
    out = text
    for i, ab in enumerate(ABBREV):
        pat = re.compile(r"(?<![A-Za-z0-9/&-])" + re.escape(ab) + r"(?![A-Za-z0-9/&-])")
        if pat.search(out):
            token = "ZQ%dZQ" % i
            out = pat.sub(token, out)
            mapping[token] = ab
    return out, mapping


def restore(text, mapping):
    for token, ab in mapping.items():
        text = text.replace(token, ab)
        # the engine sometimes lowercases or spaces the token
        text = re.sub(re.escape(token).replace("ZQ", "[Zz][Qq]"), ab, text)
    return text


def add_glossary(src_en, out_ar, seen):
    """Append the English term in parentheses after the canonical Arabic.

    `seen` is shared across one translate_many call (one page), so a term is
    annotated on its first appearance per page rather than in every block.
    """
    low = src_en.lower()
    for en, ar in GLOSSARY.items():
        if en in seen or en not in low or ar not in out_ar:
            continue
        if "(" + en in out_ar.lower():
            continue
        out_ar = out_ar.replace(ar, "%s (%s)" % (ar, en.title() if " " in en else en.capitalize()), 1)
        seen.add(en)
    return out_ar


def is_translatable(text):
    """False for formula/number-only fragments that translation would only garble."""
    words = re.findall(r"[A-Za-z]{2,}", text)
    return len(words) >= 2


def _http_json(url, timeout=45):
    req = urllib.request.Request(url, headers=UA)
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace"))


def _google(masked_texts):
    url = ENDPOINT + "&".join("q=" + urllib.parse.quote(t) for t in masked_texts)
    r = _http_json(url)
    if isinstance(r, str):
        r = [r]
    if len(masked_texts) == 1 and isinstance(r, list) and r and isinstance(r[0], list):
        r = ["".join(x[0] for x in r[0])]
    out = []
    for x in r:
        out.append(x if isinstance(x, str) else (x[0] if isinstance(x, list) and x else ""))
    return out


def _mymemory(masked_text):
    u = ("https://api.mymemory.translated.net/get?langpair=en|ar&q="
         + urllib.parse.quote(masked_text[:480]))
    return _http_json(u, timeout=30)["responseData"]["translatedText"]


def _split_long(text, limit=CHAR_BUDGET):
    """Split an over-long block on sentence boundaries."""
    if len(text) <= limit:
        return [text]
    parts, cur = [], ""
    for sent in re.split(r"(?<=[.!?]) +", text):
        if len(cur) + len(sent) + 1 > limit and cur:
            parts.append(cur)
            cur = sent
        else:
            cur = (cur + " " + sent).strip()
    if cur:
        parts.append(cur)
    return parts


def translate_many(texts, log=lambda s: None, pause=0.35):
    """Translate a list of English strings to Arabic. Returns a list, same order/length."""
    results = [None] * len(texts)
    # (index, part_index, masked, mapping) work items
    work = []
    for i, t in enumerate(texts):
        if not is_translatable(t):
            results[i] = t          # formula / numeric fragment: pass through
            continue
        masked, mp = protect(t)
        for j, part in enumerate(_split_long(masked)):
            work.append([i, j, part, mp])

    batch, size = [], 0
    batches = []
    for item in work:
        if batch and (size + len(item[2]) > CHAR_BUDGET or len(batch) >= MAX_Q):
            batches.append(batch)
            batch, size = [], 0
        batch.append(item)
        size += len(item[2])
    if batch:
        batches.append(batch)

    pieces = {}
    for bi, b in enumerate(batches):
        got = None
        for attempt in range(5):
            try:
                got = _google([it[2] for it in b])
                if len(got) != len(b):
                    raise ValueError("length mismatch %d vs %d" % (len(got), len(b)))
                break
            except Exception as e:
                wait = (5, 15, 45, 90, 150)[attempt]
                log("  retry %d/%d after %ss (%s)" % (attempt + 1, 5, wait, e))
                time.sleep(wait)
        if got is None:
            got = []
            for it in b:
                try:
                    got.append(_mymemory(it[2]))
                except Exception:
                    got.append("")
                time.sleep(1.0)
        for it, ar in zip(b, got):
            pieces.setdefault(it[0], {})[it[1]] = restore(ar, it[3])
        time.sleep(pause)

    seen = set()
    for i, t in enumerate(texts):
        if results[i] is not None:
            continue
        parts = pieces.get(i, {})
        joined = " ".join(parts[k] for k in sorted(parts))
        results[i] = add_glossary(t, joined, seen)
    return results
