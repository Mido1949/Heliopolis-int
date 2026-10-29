# The report itself now runs in the cloud (claude.ai routine "HelioMax daily report", 16:55).
# This PC only uploads its work log: every 30 minutes from 08:00 to 20:00 while it is on.
# Run once:  powershell -ExecutionPolicy Bypass -File D:\HelioMax\tools\daily_report\install_task.ps1
# Remove:    Unregister-ScheduledTask -TaskName 'HelioMax Work Log Upload'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory 'D:\HelioMax' `
  -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "D:\HelioMax\tools\daily_report\run_digest.ps1"'
$trigger = New-ScheduledTaskTrigger -Daily -At '08:00'
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '08:00' -RepetitionInterval (New-TimeSpan -Minutes 30) `
  -RepetitionDuration (New-TimeSpan -Hours 12)).Repetition
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'HelioMax Work Log Upload' -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Uploads the day''s chats and commits for the cloud daily report' -Force | Select-Object TaskName, State
# The old local report would send a second email, so keep it off.
Disable-ScheduledTask -TaskName 'HelioMax Daily Report' -ErrorAction SilentlyContinue | Out-Null
'Next upload: ' + (Get-ScheduledTaskInfo -TaskName 'HelioMax Work Log Upload').NextRunTime
