param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskSource = Join-Path $taskRoot 'dist\extension\lyrics-overlay.js'
if (-not (Test-Path -LiteralPath $taskSource)) { $taskSource = Join-Path $PSScriptRoot 'lyrics-overlay.js' }
if (-not (Test-Path -LiteralPath $taskSource)) { throw 'Build the project first (npm run build), or use the installed companion.' }
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) { throw 'Spicetify is not on PATH. Install and configure it first.' }
$taskConfig = (& spicetify -c).Trim()
if ($LASTEXITCODE -ne 0 -or -not [IO.Path]::IsPathRooted($taskConfig) -or -not $taskConfig.EndsWith('.ini')) { throw 'Could not locate the Spicetify config.' }
$taskExtensions = Join-Path (Split-Path -Parent $taskConfig) 'Extensions'
New-Item -ItemType Directory -Path $taskExtensions -Force | Out-Null
Copy-Item -LiteralPath $taskSource -Destination (Join-Path $taskExtensions 'lyrics-overlay.js') -Force
& spicetify config extensions lyrics-overlay.js
if ($LASTEXITCODE -ne 0) { throw 'Spicetify could not enable the extension.' }
if ($Apply) {
    & spicetify apply
    if ($LASTEXITCODE -ne 0) { throw 'Spicetify apply failed. Check the output above.' }
} else {
    Write-Host 'Extension copied and enabled. Run spicetify apply when ready; Spotify may restart.'
}
