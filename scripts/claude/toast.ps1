# Windows desktop notification (toast) for Claude Code.
#   As a Notification hook: reads the hook JSON from stdin and shows its message.
#   By hand:  powershell -NoProfile -File scripts/claude/toast.ps1 -Message "PR #18 merged"
param(
  [string]$Title = 'Depanini agent',
  [string]$Message = ''
)

if (-not $Message) {
  try {
    $hook = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $Message = $hook.message
  } catch {}
}
if (-not $Message) { $Message = 'Claude needs your attention' }

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$text = $xml.GetElementsByTagName('text')
$text.Item(0).AppendChild($xml.CreateTextNode($Title)) | Out-Null
$text.Item(1).AppendChild($xml.CreateTextNode($Message)) | Out-Null

# Show it under PowerShell's own app id, which Windows always knows.
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show(
  [Windows.UI.Notifications.ToastNotification]::new($xml)
)
