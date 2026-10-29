#!/bin/bash
# Setup script for the cloud environment that runs the daily report (paste it into
# the environment's "Setup script" box). It is cached, so it only runs on a fresh VM.
# Ubuntu 24.04 refuses a plain system-wide pip install, hence --break-system-packages.
python3 -m pip install --quiet --break-system-packages requests playwright tzdata || true
python3 -m playwright install --with-deps chromium || true
apt-get install -y --no-install-recommends fonts-noto-core fonts-noto-ui-core || true
exit 0
