# LLM Connector — single-command install for Windows
# Usage (run in PowerShell as Administrator):
#   iwr -Uri https://raw.githubusercontent.com/Harshakar-official/llm-connector/main/bootstrap.ps1 -OutFile bootstrap.ps1
#   .\bootstrap.ps1 -ApiKey "YOUR_KEY" -ServerUrl "https://your-platform.com"

param(
    [Parameter(Mandatory=$true)][string]$ApiKey,
    [Parameter(Mandatory=$true)][string]$ServerUrl,
    [string]$Version = "v1.0.0"
)

$ErrorActionPreference = "Stop"
$Repo = "Harshakar-official/llm-connector"
$InstallDir = "$env:ProgramData\LLMConnector"
$BinPath = "$InstallDir\connector.exe"
$ConfigPath = "$InstallDir\config.json"

# detect architecture
$Arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
if ($Arch -ne "amd64") {
    Write-Error "Unsupported architecture: $Arch"
    exit 1
}

$Binary = "connector-windows-amd64.exe"
$DownloadUrl = "https://github.com/$Repo/releases/download/$Version/$Binary"

Write-Host "==> LLM Connector bootstrap $Version"
Write-Host "    URL:   $ServerUrl"
Write-Host ""

# create install directory
New-Item -ItemType Directory -Force -Path "$InstallDir\data" | Out-Null

# download binary
Write-Host "==> Downloading $Binary ..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $DownloadUrl -OutFile $BinPath

# write config
Write-Host "==> Writing config..."
$Config = @"
{
    "api_key": "$ApiKey",
    "server_url": "$ServerUrl",
    "ollama_url": "http://localhost:11434",
    "heartbeat_interval": 30,
    "reconnect_delay": 5,
    "health_port": 9199,
    "data_dir": "$InstallDir\data"
}
"@
Set-Content -Path $ConfigPath -Value $Config

# register as Windows service using sc.exe
Write-Host "==> Installing service..."
$serviceName = "LLMConnector"
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    sc.exe stop $serviceName 2>$null
    sc.exe delete $serviceName 2>$null
    Start-Sleep -Seconds 2
}
sc.exe create $serviceName binPath="$BinPath $ConfigPath" start=auto
sc.exe description $serviceName "LLM Connector – local LLM bridge to cloud testing platform"
sc.exe start $serviceName

Start-Sleep -Seconds 3

# verify
Write-Host ""
Write-Host "==> Checking health..."
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:9199/health" -ErrorAction Stop
    Write-Host "    [OK] Connector is running!"
    Write-Host ($health | ConvertTo-Json)
} catch {
    Write-Host "    [WARN] Health endpoint not responding yet. Check service status:"
    Write-Host "       Get-Service $serviceName"
    Write-Host "       Get-Content $InstallDir\connector.log"
}

Write-Host ""
Write-Host "==> Done. Connector installed at $InstallDir"
Write-Host "    Health: http://127.0.0.1:9199/health"
Write-Host "    Config: $ConfigPath"
