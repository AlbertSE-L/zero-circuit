$ErrorActionPreference = 'Stop'
$circuitServerPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server.mjs'))
$circuitProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($circuitServerPath) }
foreach ($circuitProcess in $circuitProcesses) {
    Stop-Process -Id $circuitProcess.ProcessId -ErrorAction Stop
    Write-Host "Stopped Zero Circuit server, PID $($circuitProcess.ProcessId)"
}
if (-not $circuitProcesses) { Write-Host 'No matching server found. For manually started terminals, press Ctrl+C there.' }
