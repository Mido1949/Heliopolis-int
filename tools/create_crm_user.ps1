# Creates a CRM team account. Run from D:\HelioMax:
#   powershell -ExecutionPolicy Bypass -File tools\create_crm_user.ps1
# The password is typed by you at the prompt and is never stored.
# Supabase's own "Add user" button can't be used: the auth trigger needs
# org_id in user_metadata or the signup fails with a 500.

$ErrorActionPreference = 'Stop'
$OrgId = '3f3fa998-aea4-4b38-b701-2c4b1e8253a1'

$envFile = Get-Content (Join-Path $PSScriptRoot '..\.env.local')
function EnvValue($key) {
  ($envFile | Where-Object { $_ -match "^$key=" } | Select-Object -First 1) -replace "^$key=", '' -replace '"', ''
}
$Url = EnvValue 'NEXT_PUBLIC_SUPABASE_URL'
$Key = EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
$H = @{ apikey = $Key; Authorization = "Bearer $Key"; 'Content-Type' = 'application/json; charset=utf-8' }

$name  = Read-Host 'Name (e.g. mariam)'
$email = Read-Host "Email [$($name.ToLower())@hc.com]"
if (-not $email) { $email = "$($name.ToLower())@hc.com" }
$team  = Read-Host 'CRM team [cs]'
if (-not $team) { $team = 'cs' }
$role  = Read-Host 'Role [admin]'
if (-not $role) { $role = 'admin' }
$secure = Read-Host 'Password' -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

$body = @{ email = $email; password = $password; email_confirm = $true; user_metadata = @{ name = $name; org_id = $OrgId } } | ConvertTo-Json -Depth 4
$user = Invoke-RestMethod -Method Post -Uri "$Url/auth/v1/admin/users" -Headers $H -Body ([Text.Encoding]::UTF8.GetBytes($body))
$id = $user.id
Write-Host "Created auth user $email ($id)"

$profile = @{ name = $name; role = $role; crm_team = $team; country = 'EG'; org_id = $OrgId } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "$Url/rest/v1/profiles?id=eq.$id" -Headers $H -Body ([Text.Encoding]::UTF8.GetBytes($profile)) | Out-Null

$existing = Invoke-RestMethod -Uri "$Url/rest/v1/organization_members?user_id=eq.$id&select=id" -Headers $H
if (-not $existing) {
  $member = @{ org_id = $OrgId; user_id = $id; role = $role } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$Url/rest/v1/organization_members" -Headers $H -Body ([Text.Encoding]::UTF8.GetBytes($member)) | Out-Null
}
Write-Host "Done: $email can log in now (team=$team, role=$role, country=EG)."
