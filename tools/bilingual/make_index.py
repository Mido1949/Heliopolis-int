# -*- coding: utf-8 -*-
"""Build an index page linking every finished bilingual book."""
import io
import os
import re
import sys

from run_all import JOBS, OUT

W = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

PAGE = """<meta charset="utf-8">
<title>CMA Bilingual Library</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>
:root{--ink:#16181d;--muted:#6b7280;--rule:#e3e5ea;--card:#f6f8fa;--accent:#0f5c8c;}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:16px/1.6 "Source Serif 4",Georgia,serif}
.wrap{max-width:880px;margin:0 auto;padding:56px 28px 96px}
h1{font-size:30px;margin:0 0 6px}
.sub{color:var(--muted);font:14px/1.6 system-ui,sans-serif;margin:0 0 8px}
.ar-note{direction:rtl;text-align:right;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;
  background:var(--card);border-right:3px solid var(--accent);padding:12px 16px;border-radius:4px;margin:0 0 36px}
.grp{font:600 11px/1 system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;
  color:var(--muted);margin:32px 0 12px;padding-top:12px;border-top:1px solid var(--rule)}
a.book{display:flex;justify-content:space-between;align-items:baseline;gap:16px;
  text-decoration:none;color:inherit;padding:13px 16px;border:1px solid var(--rule);
  border-radius:6px;margin-bottom:8px}
a.book:hover{border-color:var(--accent);background:var(--card)}
.t{font-weight:600}
.m{color:var(--muted);font:13px/1 system-ui,sans-serif;white-space:nowrap}
</style>
"""


def stats(path):
    h = open(path, encoding="utf-8").read()
    return (h.count('class="pg-num"'), h.count('class="unit'),
            len(re.findall(r'lang="ar"></p>', h)))


def main():
    rows = []
    for rel, name, title in JOBS:
        p = os.path.join(OUT, name)
        if os.path.exists(p):
            rows.append((title, name) + stats(p))

    o = [PAGE, '<div class="wrap">',
         '<h1>CMA — Bilingual Library</h1>',
         '<p class="sub">HOCK &amp; Gleim CMA 2020 · English with Arabic under every block</p>',
         '<p class="ar-note">كل صفحة مقسّمة إلى نصوص: النص الإنجليزي فوق، وتحته مباشرة الترجمة العربية. '
         'الاختصارات المحاسبية (EBIT, WACC, ROI…) محفوظة بالإنجليزي كما هي.</p>']

    groups = [("HOCK — Part 1", "P1"), ("HOCK — Part 2", "P2"), ("Gleim", "Gleim")]
    for label, key in groups:
        sel = [r for r in rows if (key in r[1] and r[1].startswith("Hock")) or
               (key == "Gleim" and r[1].startswith("Gleim"))]
        if not sel:
            continue
        o.append('<div class="grp">%s</div>' % label)
        for title, name, pages, units, empty in sel:
            gap = "" if not empty else " · %d gaps" % empty
            o.append('<a class="book" href="%s"><span class="t">%s</span>'
                     '<span class="m">%d pages · %s blocks%s</span></a>'
                     % (name, title, pages, format(units, ","), gap))

    tp = sum(r[2] for r in rows)
    tu = sum(r[3] for r in rows)
    o.append('<div class="grp">Total</div><p class="sub">%d books · %s pages · %s bilingual blocks</p>'
             % (len(rows), format(tp, ","), format(tu, ",")))
    o.append("</div>")

    dst = os.path.join(OUT, "index.html")
    open(dst, "w", encoding="utf-8").write("\n".join(o))
    W.write("wrote %s — %d books, %d pages, %d blocks\n" % (dst, len(rows), tp, tu))
    W.flush()


if __name__ == "__main__":
    main()
