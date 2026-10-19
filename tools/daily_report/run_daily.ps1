# Daily work report: collects the day's data, has Claude write it up, builds the
# PDF and emails it. Registered in Task Scheduler as "HelioMax Daily Report" (16:00).
$ErrorActionPreference = 'Continue'
Set-Location 'D:\HelioMax'
$env:PYTHONIOENCODING = 'utf-8'

$logDir = 'D:\HelioMax\reports\daily\_logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ((Get-Date -Format 'yyyy-MM-dd') + '.log')

$claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
$tools = @(
  'Read', 'Write', 'Glob', 'Grep', 'ToolSearch',
  'Bash(python tools/daily_report/collect.py:*)',
  'Bash(python tools/daily_report/build.py:*)',
  'mcp__claude_ai_meta__ads_get_field_context',
  'mcp__claude_ai_meta__ads_get_ad_entities',
  'mcp__claude_ai_Gmail__send_message'
)

"=== $(Get-Date -Format s) start ===" | Out-File $log -Append -Encoding utf8
& $claude -p 'Read tools/daily_report/prompt.md and carry out the run it describes, start to finish.' `
  --model sonnet --max-turns 60 --allowedTools $tools *>&1 | Out-File $log -Append -Encoding utf8
"=== $(Get-Date -Format s) exit $LASTEXITCODE ===" | Out-File $log -Append -Encoding utf8
