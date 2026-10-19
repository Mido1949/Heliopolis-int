# -*- coding: utf-8 -*-
"""Fill in blocks the main run left untranslated, then re-render the HTML.

A batch that fails all retries writes empty strings into the cache. This pass
finds those, retranslates them one at a time (a single failing block can't take
its neighbours down with it), and rebuilds the page from the repaired cache.
"""
import hashlib
import io
import json
import os
import subprocess
import sys

import fitz

import engine_google
from run_all import JOBS, OUT, SP
from translate_pdf import page_blocks

HERE = os.path.dirname(os.path.abspath(__file__))
W = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")


def repair(pdf, out, title):
    cache_path = out + ".cache.json"
    if not os.path.exists(cache_path):
        W.write("  no cache, skipping\n")
        return 0
    cache = json.load(open(cache_path, encoding="utf-8"))
    holes = {k for k, v in cache.items() if not (v or "").strip()}
    if not holes:
        W.write("  no gaps\n")
        return 0

    doc = fitz.open(pdf)
    texts = {}
    for pno in range(len(doc)):
        for u in page_blocks(doc[pno]):
            k = hashlib.sha1(u["text"].encode("utf-8")).hexdigest()
            if k in holes:
                texts[k] = u["text"]
    doc.close()

    W.write("  %d gaps, %d located in source\n" % (len(holes), len(texts)))
    fixed = 0
    for k, en in texts.items():
        ar = engine_google.translate_many([en])[0]
        if ar.strip():
            cache[k] = ar
            fixed += 1
    json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
    W.write("  filled %d\n" % fixed)

    if fixed:
        subprocess.call([sys.executable, os.path.join(HERE, "translate_pdf.py"),
                         "--dry", "--pdf", pdf, "--out", out, "--title", title], cwd=HERE)
    return fixed


def main():
    total = 0
    for rel, name, title in JOBS:
        pdf = os.path.join(SP, rel)
        out = os.path.join(OUT, name)
        if not os.path.exists(out):
            continue
        W.write("%s\n" % name)
        W.flush()
        total += repair(pdf, out, title)
    W.write("\nrepaired %d blocks total\n" % total)
    W.flush()


if __name__ == "__main__":
    main()
