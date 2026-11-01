$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $circuitNode = $nodeCommand.Source }
else { $circuitNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $circuitNode)) { throw 'Please install Node.js 22+ first.' }
& $circuitNode (Join-Path $PSScriptRoot 'server.mjs')
