# -*- coding: utf-8 -*-
"""Drive translate_pdf.py over every CMA PDF, writing one bilingual HTML per book."""
import os
import subprocess
import sys
import time

SP = r"C:/Users/Mido/AppData/Local/Temp/cma_src"
OUT = r"d:/HelioMax/translations"
HERE = os.path.dirname(os.path.abspath(__file__))

JOBS = [
    ("hockp2/Hock P2 2020/CMA_P2_Text_V1_Aug19_A4.pdf",   "Hock_CMA_P2_Vol1.html",     "HOCK CMA Part 2 - Volume 1 (Sections A & B)"),
    ("hockp2/Hock P2 2020/CMA_P2_Text_V2_July19_A4.pdf",  "Hock_CMA_P2_Vol2.html",     "HOCK CMA Part 2 - Volume 2"),
    ("hockp2/Hock P2 2020/CMA_P2_Text_V1_2020_Answers.pdf", "Hock_CMA_P2_Vol1_Answers.html", "HOCK CMA Part 2 - Volume 1 Answers"),
    ("hockp2/Hock P2 2020/CMA_P2_Text_V2_2020_Answers.pdf", "Hock_CMA_P2_Vol2_Answers.html", "HOCK CMA Part 2 - Volume 2 Answers"),
    ("rest/Hock P1 2020/CMA_P1_Text_V1_Aug19_A4.pdf",     "Hock_CMA_P1_Vol1.html",     "HOCK CMA Part 1 - Volume 1"),
    ("rest/Hock P1 2020/CMA_P1_Text_V2_Aug19_A4.pdf",     "Hock_CMA_P1_Vol2.html",     "HOCK CMA Part 1 - Volume 2"),
    ("rest/Hock P1 2020/CMA_P1_Text_V1_2020_Answers.pdf", "Hock_CMA_P1_Vol1_Answers.html", "HOCK CMA Part 1 - Volume 1 Answers"),
    ("rest/Hock P1 2020/CMA_P1_Text_V2_2020_Answers.pdf", "Hock_CMA_P1_Vol2_Answers.html", "HOCK CMA Part 1 - Volume 2 Answers"),
    ("rest/Glem 2020/Glem P1 - 2020/CMA P1 - 2020.pdf",   "Gleim_CMA_P1.html",         "Gleim CMA Part 1 - 2020"),
    ("rest/Glem 2020/Glem P2 - 2020/CMA P2 - 2020.pdf",   "Gleim_CMA_P2.html",         "Gleim CMA Part 2 - 2020"),
]


def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    t0 = time.time()
    for n, (rel, out, title) in enumerate(JOBS, 1):
        pdf = os.path.join(SP, rel)
        dst = os.path.join(OUT, out)
        if not os.path.exists(pdf):
            sys.stdout.write("[%d/%d] MISSING %s\n" % (n, len(JOBS), pdf))
            continue
        sys.stdout.write("\n===== [%d/%d] %s  (%.0f min elapsed) =====\n"
                         % (n, len(JOBS), title, (time.time() - t0) / 60))
        sys.stdout.flush()
        rc = subprocess.call([sys.executable, os.path.join(HERE, "translate_pdf.py"),
                              "--engine", "google", "--pdf", pdf, "--out", dst,
                              "--title", title], cwd=HERE)
        sys.stdout.write("[%d/%d] exit=%s -> %s\n" % (n, len(JOBS), rc, dst))
        sys.stdout.flush()
    sys.stdout.write("\nALL DONE in %.0f min\n" % ((time.time() - t0) / 60))


if __name__ == "__main__":
    main()
