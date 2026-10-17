param([string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA '0xTuFa7\LyricsOverlay'))
$ErrorActionPreference = 'Stop'
$taskRepository = 'xtufa7/Lyrics-Overlay'
$taskHeaders = @{ 'User-Agent' = 'Lyrics-Overlay-Installer'; Accept = 'application/vnd.github+json' }
Write-Host 'Lyrics Overlay by 0xTuFa7' -ForegroundColor Magenta
$taskRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/$taskRepository/releases/latest" -Headers $taskHeaders
if ($taskRelease.tag_name -notmatch '^v\d+\.\d+\.\d+$') { throw 'The release version is not supported by this installer.' }
$taskAsset = @($taskRelease.assets | Where-Object { $_.name -match '^Lyrics-Overlay-[\d.]+-Windows-x64\.zip$' })
$taskChecksums = @($taskRelease.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' })
if ($taskAsset.Count -ne 1 -or $taskChecksums.Count -ne 1) { throw 'The release does not contain a portable x64 archive and its checksum manifest.' }
$taskTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$taskTempDirectory = Join-Path $taskTempRoot ('LyricsOverlay-' + [guid]::NewGuid().ToString('N'))
$taskResolvedTemp = [IO.Path]::GetFullPath($taskTempDirectory)
if (-not $taskResolvedTemp.StartsWith($taskTempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid temporary path.' }
New-Item -ItemType Directory -Path $taskResolvedTemp -Force | Out-Null
try {
    $taskZipPath = Join-Path $taskResolvedTemp $taskAsset[0].name
    $taskChecksumPath = Join-Path $taskResolvedTemp 'SHA256SUMS.txt'
    Write-Host ('Downloading ' + $taskRelease.tag_name + '...')
    Invoke-WebRequest -Uri $taskAsset[0].browser_download_url -OutFile $taskZipPath -UseBasicParsing
    Invoke-WebRequest -Uri $taskChecksums[0].browser_download_url -OutFile $taskChecksumPath -UseBasicParsing
    $taskExpectedHash = $null
    foreach ($taskLine in Get-Content -LiteralPath $taskChecksumPath) {
        if ($taskLine -match '^([a-fA-F0-9]{64})\s+(.+)$' -and $Matches[2] -eq $taskAsset[0].name) { $taskExpectedHash = $Matches[1] }
    }
    if (-not $taskExpectedHash -or (Get-FileHash -LiteralPath $taskZipPath -Algorithm SHA256).Hash -ne $taskExpectedHash) { throw 'Checksum verification failed. No application was started.' }
    $taskInstallRoot = [IO.Path]::GetFullPath($InstallDirectory)
    $taskDestination = [IO.Path]::GetFullPath((Join-Path $taskInstallRoot $taskRelease.tag_name))
    if (-not $taskDestination.StartsWith($taskInstallRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid installation path.' }
    New-Item -ItemType Directory -Path $taskDestination -Force | Out-Null
    $taskExecutable = Join-Path $taskDestination 'Spicetify Lyrics Overlay.exe'
    $taskInstalledMarker = Join-Path $taskDestination '.release-sha256'
    $taskAlreadyInstalled = (Test-Path -LiteralPath $taskExecutable) -and (Test-Path -LiteralPath $taskInstalledMarker) -and ((Get-Content -LiteralPath $taskInstalledMarker -Raw).Trim() -eq $taskExpectedHash)
    if (-not $taskAlreadyInstalled) {
        Expand-Archive -LiteralPath $taskZipPath -DestinationPath $taskDestination -Force
        Set-Content -LiteralPath $taskInstalledMarker -Value $taskExpectedHash -Encoding ascii
    }
    if (-not (Test-Path -LiteralPath $taskExecutable)) { throw 'The application executable was not found in the archive.' }
    $taskShortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Lyrics Overlay.lnk'
    $taskShortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($taskShortcutPath)
    $taskShortcut.TargetPath = $taskExecutable
    $taskShortcut.WorkingDirectory = $taskDestination
    $taskShortcut.Description = 'Lyrics Overlay by 0xTuFa7'
    $taskShortcut.Save()
    Write-Host 'Verified. Starting Lyrics Overlay and connecting Spotify...' -ForegroundColor Green
    Start-Process -FilePath $taskExecutable -ArgumentList '--connect-spotify' -WindowStyle Hidden
} finally {
    # Only this installer-created, validated temporary directory is removed.
    if ($taskResolvedTemp.StartsWith($taskTempRoot, [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($taskResolvedTemp) -match '^LyricsOverlay-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $taskResolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
