# Registers the daily report in Windows Task Scheduler (every day, 17:00 local time).
# Run once:  powershell -ExecutionPolicy Bypass -File D:\HelioMax\tools\daily_report\install_task.ps1
# Remove:    Unregister-ScheduledTask -TaskName 'HelioMax Daily Report'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory 'D:\HelioMax' `
  -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "D:\HelioMax\tools\daily_report\run_daily.ps1"'
$trigger = New-ScheduledTaskTrigger -Daily -At '17:00'
# StartWhenAvailable: if the PC was off at 17:00 the report runs as soon as it is back on.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'HelioMax Daily Report' -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Builds the HelioMax daily work report PDF and emails it to Mido' -Force | Select-Object TaskName, State
'Next run: ' + (Get-ScheduledTaskInfo -TaskName 'HelioMax Daily Report').NextRunTime
