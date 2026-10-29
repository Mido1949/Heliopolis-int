# Uploads today's chats, commits and touched files for the cloud daily report, which
# runs at 17:00 on Anthropic's servers and cannot see this PC. Registered in Task
# Scheduler as "HelioMax Work Log Upload" (every 30 minutes); each upload replaces the
# last, so the report has the day up to the last time this PC was on.
$ErrorActionPreference = 'Continue'
Set-Location 'D:\HelioMax'
$env:PYTHONIOENCODING = 'utf-8'

$logDir = 'D:\HelioMax\reports\daily\_logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ((Get-Date -Format 'yyyy-MM-dd') + '.log')

"=== $(Get-Date -Format s) digest ===" | Out-File $log -Append -Encoding utf8
python tools/daily_report/collect.py --digest *>&1 | Out-File $log -Append -Encoding utf8
