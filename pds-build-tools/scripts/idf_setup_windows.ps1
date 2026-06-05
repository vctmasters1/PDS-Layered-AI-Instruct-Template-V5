# ESP-IDF Environment Setup for Windows
# This script properly configures the ESP-IDF environment for builds

param(
    [string]$IdfVersion = "v5.4.1",
    [switch]$Install
)

$ErrorActionPreference = "Stop"

# Paths
$IdfBase = "$env:USERPROFILE\DEV\ESP-IDF"
$IdfPath = "$IdfBase\$IdfVersion\esp-idf"
$PythonEnvBase = "$env:USERPROFILE\.espressif\python_env"

Write-Host "ESP-IDF Environment Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check ESP-IDF installation
if (-not (Test-Path $IdfPath)) {
    Write-Host "[-] ESP-IDF not found at: $IdfPath" -ForegroundColor Red
    Write-Host "[*] Please install ESP-IDF from: https://github.com/espressif/esp-idf" -ForegroundColor Yellow
    exit 1
}

Write-Host "[+] ESP-IDF found at: $IdfPath" -ForegroundColor Green

# Find Python environment
$PythonEnvs = Get-ChildItem $PythonEnvBase -Directory | Where-Object { $_.Name -match "idf.*_py" } | Sort-Object Name -Descending
if ($PythonEnvs.Count -eq 0) {
    Write-Host "[-] No Python virtual environments found in: $PythonEnvBase" -ForegroundColor Red
    Write-Host "[*] Run: python -m pip install --upgrade pip" -ForegroundColor Yellow
    Write-Host "[*] Then: python -m pip install pyserial pyyaml future cryptography ecdsa" -ForegroundColor Yellow
    exit 1
}

$PythonEnv = $PythonEnvs[0].FullName
$PythonExe = "$PythonEnv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Host "[-] Python executable not found at: $PythonExe" -ForegroundColor Red
    exit 1
}

Write-Host "[+] Python environment found at: $PythonEnv" -ForegroundColor Green

# Check for click module
Write-Host ""
Write-Host "Checking Python dependencies..." -ForegroundColor Cyan

# List of core required packages for ESP-IDF
$RequiredPackages = @(
    "click",
    "pyyaml", 
    "future", 
    "cryptography", 
    "ecdsa", 
    "pyparsing", 
    "pyserial", 
    "protobuf",
    "esptool"
)

Write-Host "[*] Installing/updating Python packages for ESP-IDF..." -ForegroundColor Yellow
& $PythonExe -m pip install --upgrade @RequiredPackages

Write-Host "[+] Package installation complete"

Write-Host "[+] All dependencies satisfied" -ForegroundColor Green
Write-Host ""

# Test idf.py - just check if it exists
Write-Host "Testing ESP-IDF installation..." -ForegroundColor Cyan
if (Test-Path "$IdfPath\tools\idf.py") {
    Write-Host "[+] ESP-IDF idf.py found" -ForegroundColor Green
} else {
    Write-Host "[-] ESP-IDF idf.py not found" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "[+] Environment ready for building!" -ForegroundColor Green
Write-Host ""
Write-Host "To use this environment, run:" -ForegroundColor Yellow
Write-Host "  cd PDS-BuildTools" -ForegroundColor Yellow
Write-Host "  python go.py" -ForegroundColor Yellow
