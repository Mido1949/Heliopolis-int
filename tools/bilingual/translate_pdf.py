# -*- coding: utf-8 -*-
"""
Bilingual PDF builder: extracts text blocks per page from a PDF, translates each
block to Arabic via the Anthropic API, and emits an HTML page where every English
block is immediately followed by its Arabic translation (RTL).

Usage:
  python translate_pdf.py --pdf IN.pdf --out OUT.html --start 1 --end 20
Translations are cached in a JSON sidecar so re-runs cost nothing.
"""
import argparse, hashlib, html, json, os, re, sys, time
import fitz


# ---------- key ----------
def load_key():
    k = os.environ.get("ANTHROPIC_API_KEY")
    if k:
        return k
    for p in (r"d:\HelioMax\.env.local", r"d:\HelioMax\.env"):
        if os.path.exists(p):
            for line in open(p, encoding="utf-8", errors="ignore"):
                line = line.strip()
                if line.startswith("ANTHROPIC_API_KEY"):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("ANTHROPIC_API_KEY not found")


# ---------- extraction ----------
HEADER_Y, FOOTER_Y = 60, 770


def page_blocks(page):
    """Return [{'text':..., 'kind':'h'|'p'}] for one page, in reading order, headers/footers dropped."""
    out = []
    d = page.get_text("dict")
    for blk in d["blocks"]:
        if blk.get("type") != 0:
            continue
        y0, y1 = blk["bbox"][1], blk["bbox"][3]
        if y1 < HEADER_Y or y0 > FOOTER_Y:
            continue
        lines, sizes = [], []
        bold = nspan = 0
        for ln in blk["lines"]:
            parts = []
            for sp in ln["spans"]:
                parts.append(sp["text"])
                sizes.append(sp["size"])
                nspan += 1
                if sp["flags"] & 16 or "Bold" in sp.get("font", ""):
                    bold += 1
            lines.append("".join(parts))
        text = " ".join(" ".join(lines).split())
        if len(text) < 2:
            continue
        avg = sum(sizes) / len(sizes) if sizes else 10.0
        is_head = (nspan and bold / nspan > 0.6 and len(text) < 120) or avg > 12.5
        out.append({"text": text, "kind": "h" if is_head else "p", "y": y0, "y1": y1})
    out.sort(key=lambda b: b["y"])
    return merge_fragments(out)


# A block that ends without terminal punctuation, followed by one that starts
# lowercase, is one sentence the PDF split across lines. Translating the halves
# separately mistranslates them ("and parties ..." -> "وحفلات", parties as in a
# celebration), so rejoin them before anything is sent to the translator.
_ENDS_SENTENCE = re.compile(r'[.!?:;]["\')\]]?\s*$')
_STARTS_LOWER = re.compile(r'^[a-z(]')
# "a." / "b)" / "iv." etc. start a new outline item, not a continued sentence.
_LIST_MARKER = re.compile(r'^\(?[a-z]{1,3}[.)]\s')


def merge_fragments(units, max_gap=25.0):
    out = []
    for u in units:
        prev = out[-1] if out else None
        if (prev is not None
                and prev["kind"] == "p" and u["kind"] == "p"
                and not _ENDS_SENTENCE.search(prev["text"])
                and _STARTS_LOWER.match(u["text"])
                and not _LIST_MARKER.match(u["text"])
                and (u["y"] - prev["y1"]) < max_gap):
            prev["text"] = prev["text"] + " " + u["text"]
            prev["y1"] = u["y1"]
            continue
        out.append(u)
    return out


# ---------- translation ----------
SYSTEM = (
    "You translate Certified Management Accountant (CMA) study material from English to "
    "Modern Standard Arabic for Egyptian accounting students.\n"
    "Rules:\n"
    "1. Translate accurately and completely. Never summarise, never omit, never add commentary.\n"
    "2. Keep every number, formula, currency amount, percentage, and Latin-script abbreviation "
    "(EPS, ROI, EBIT, WACC ...) exactly as-is; do not convert digits to Arabic-Indic numerals.\n"
    "3. For an accounting term, give the standard Arabic term followed by the English term in "
    "parentheses on first use inside a block, e.g. الرافعة المالية (Financial Leverage).\n"
    "4. Keep a textbook register: clear, formal, explanatory.\n"
    "5. A heading stays a short heading.\n"
    "Return ONLY a JSON array of strings: one translation per input string, same order, same length."
)


def translate_batch(client, model, texts, tries=4):
    payload = json.dumps(texts, ensure_ascii=False)
    for attempt in range(tries):
        try:
            r = client.messages.create(
                model=model,
                max_tokens=8000,
                system=SYSTEM,
                messages=[{"role": "user",
                           "content": "Translate each string in this JSON array:\n" + payload}],
            )
            txt = r.content[0].text.strip()
            m = re.search(r"\[.*\]", txt, re.S)
            arr = json.loads(m.group(0) if m else txt)
            if isinstance(arr, list) and len(arr) == len(texts):
                return [str(x) for x in arr]
            if attempt == tries - 1:
                return [translate_one(client, model, t) for t in texts]
        except Exception as e:
            if attempt == tries - 1:
                sys.stderr.write("  ! batch failed: %s\n" % e)
                return ["" for _ in texts]
            time.sleep(2 * (attempt + 1))
    return ["" for _ in texts]


def translate_one(client, model, text):
    try:
        r = client.messages.create(
            model=model, max_tokens=4000, system=SYSTEM,
            messages=[{"role": "user", "content": json.dumps([text], ensure_ascii=False)}])
        m = re.search(r"\[.*\]", r.content[0].text, re.S)
        return json.loads(m.group(0))[0]
    except Exception:
        return ""


# ---------- html ----------
HEAD = """<meta charset="utf-8">
<title>%(title)s</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>
:root{--ink:#16181d;--muted:#6b7280;--rule:#e3e5ea;--ar-bg:#f6f8fa;--accent:#0f5c8c;}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:16px/1.6 "Source Serif 4",Georgia,serif;}
.wrap{max-width:900px;margin:0 auto;padding:48px 28px 96px}
.doc-title{font-size:28px;font-weight:600;margin:0 0 4px}
.doc-sub{color:var(--muted);font-size:14px;margin:0 0 40px;font-family:system-ui,sans-serif}
.pg{margin:0 0 34px;border-top:1px solid var(--rule);padding-top:10px}
.pg-num{font:600 11px/1 system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-bottom:18px}
.unit{margin:0 0 22px}
.en{margin:0 0 6px}
.ar{margin:0;direction:rtl;text-align:right;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;
    font-size:16px;line-height:1.95;background:var(--ar-bg);border-right:3px solid var(--accent);
    padding:10px 14px;border-radius:4px}
.unit.h .en{font-size:20px;font-weight:600;color:var(--accent);margin-top:8px}
.unit.h .ar{font-weight:600;font-size:18px;background:none;padding:4px 14px 4px 0}
@media print{.unit{break-inside:avoid}}
</style>
"""


def render(title, sub, pages):
    o = [HEAD % {"title": html.escape(title)}, '<div class="wrap">',
         '<h1 class="doc-title">%s</h1><p class="doc-sub">%s</p>'
         % (html.escape(title), html.escape(sub))]
    for pno, units in pages:
        o.append('<section class="pg"><div class="pg-num">Page %d &nbsp;&middot;&nbsp; صفحة %d</div>'
                 % (pno, pno))
        for u in units:
            o.append('<div class="unit %s"><p class="en">%s</p><p class="ar" dir="rtl" lang="ar">%s</p></div>'
                     % ("h" if u["kind"] == "h" else "p",
                        html.escape(u["text"]), html.escape(u.get("ar", ""))))
        o.append("</section>")
    o.append("</div>")
    return "\n".join(o)


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--end", type=int, default=0)
    ap.add_argument("--model", default="claude-haiku-4-5-20251001")
    ap.add_argument("--title", default="")
    ap.add_argument("--engine", default="google", choices=("google", "anthropic"))
    ap.add_argument("--dry", action="store_true", help="extract only, no translation")
    a = ap.parse_args()

    doc = fitz.open(a.pdf)
    end = a.end or len(doc)
    cache_path = a.out + ".cache.json"
    cache = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}

    client = engine = None
    if not a.dry:
        if a.engine == "google":
            import engine_google as engine
        else:
            from anthropic import Anthropic
            client = Anthropic(api_key=load_key())

    pages, n_new = [], 0
    for pno in range(a.start, end + 1):
        units = page_blocks(doc[pno - 1])
        if not units:
            continue
        todo, idx = [], []
        for i, u in enumerate(units):
            k = hashlib.sha1(u["text"].encode("utf-8")).hexdigest()
            u["_k"] = k
            if k in cache:
                u["ar"] = cache[k]
            elif not a.dry:
                todo.append(u["text"])
                idx.append(i)
        if todo:
            if engine is not None:
                res = engine.translate_many(todo, log=lambda s: sys.stdout.write(s + "\n"))
                for j, ar in zip(idx, res):
                    units[j]["ar"] = ar
                    cache[units[j]["_k"]] = ar
                    n_new += 1
            else:
                for s in range(0, len(todo), 8):
                    chunk, ci = todo[s:s + 8], idx[s:s + 8]
                    for j, ar in zip(ci, translate_batch(client, a.model, chunk)):
                        units[j]["ar"] = ar
                        cache[units[j]["_k"]] = ar
                        n_new += 1
            json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
        pages.append((pno, units))
        sys.stdout.write("page %d  blocks=%d\n" % (pno, len(units)))
        sys.stdout.flush()

    title = a.title or os.path.basename(a.pdf)
    sub = "English / Arabic - pages %d-%d - %d blocks" % (a.start, end, sum(len(u) for _, u in pages))
    open(a.out, "w", encoding="utf-8").write(render(title, sub, pages))
    sys.stdout.write("wrote %s | new translations: %d\n" % (a.out, n_new))


if __name__ == "__main__":
    main()
