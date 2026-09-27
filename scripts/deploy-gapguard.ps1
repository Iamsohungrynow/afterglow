# Deploys the GapGuard Stylus contract, seeds it with real weekend gaps and wires it into the
# markets listed in deployments/<chainId>.json, using the encrypted Foundry keystore "deployer".
#
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-gapguard.ps1
#
# Asks for the keystore password once. It is written to a temporary file only for the duration of
# the script (cargo-stylus and cast read it from there) and deleted at the end, even on failure.

param(
  [string]$Rpc = "https://rpc.testnet.chain.robinhood.com",
  [string]$ChainId = "46630",
  [string]$Owner = "0x670ff60b857007295D3DfC4B2009203163BBA9B8"
)
$ErrorActionPreference = "Stop"
$env:Path += ";$HOME\.foundry\bin"
$root = Split-Path $PSScriptRoot -Parent
$crate = Join-Path $root "stylus\gap-guard"
$wasm = Join-Path $crate "target\wasm32-unknown-unknown\release\gap_guard.wasm"
$keystore = Join-Path $HOME ".foundry\keystores\deployer"
$dep = Get-Content (Join-Path $root "deployments\$ChainId.json") -Raw | ConvertFrom-Json

# Weekend gaps in bps from the Robinhood Chain mainnet Chainlink history (scripts/weekend-gaps.mjs, 27 Sep 2026).
$gaps = @{
  "TSLA" = "[86,132,-46,21,125,92,31,24,115,-58,4,-108,38]"
  "AMZN" = "[33,37,-38,1,100,95,-28,52,6,-49,-45,-117,43]"
  "NVDA" = "[86,88,1,30,118,107,20,-12,117,-81,36,-111,15]"
  "SPY"  = "[26,55,-8,-29,70,68,-5,-14,8,-53,-8,-68,49]"
  "QQQ"  = "[110,116,-40,53,176,68,22,36,15,-57,-5,-117,41]"
}

$secure = Read-Host "Keystore password for 'deployer'" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pwFile = New-TemporaryFile
try {
  [IO.File]::WriteAllText($pwFile, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr))
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

  function Send([string[]]$castArgs) {
    $out = & cast send @castArgs --keystore $keystore --password-file $pwFile --rpc-url $Rpc --json
    if ($LASTEXITCODE -ne 0) { throw "cast send failed" }
    $r = $out | ConvertFrom-Json
    if ($r.status -ne "0x1") { throw "transaction reverted: $($r.transactionHash)" }
  }

  Write-Host "1/4 Building and deploying GapGuard (deploy + Stylus activation)..." -ForegroundColor Yellow
  Push-Location $crate
  # cargo writes progress to stderr; in Windows PowerShell 5.1 that must not count as an error.
  $ErrorActionPreference = "Continue"
  try {
    & cargo rustc --release --target wasm32-unknown-unknown --lib --crate-type cdylib --quiet 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "wasm build failed" }
    $log = & cargo stylus deploy --wasm-file $wasm --endpoint $Rpc --keystore-path $keystore --keystore-password-path $pwFile --no-verify 2>&1 | Out-String
    $deployExit = $LASTEXITCODE
  } finally {
    Pop-Location
    $ErrorActionPreference = "Stop"
  }
  $log = $log -replace "\x1b\[[0-9;]*m", ""
  if ($deployExit -ne 0) { Write-Host $log; throw "cargo stylus deploy failed" }
  $m = [regex]::Match($log, "deployed code at address:?\s*(0x[0-9a-fA-F]{40})")
  if (-not $m.Success) { Write-Host $log; throw "could not find the deployed address in the output above" }
  $guard = $m.Groups[1].Value
  Write-Host "    GapGuard at $guard"

  Write-Host "2/4 Initializing (owner $Owner)..." -ForegroundColor Yellow
  Send @($guard, "initialize(address)", $Owner)

  Write-Host "3/4 Seeding weekend gaps..." -ForegroundColor Yellow
  foreach ($p in $dep.markets.PSObject.Properties) {
    if ($gaps.ContainsKey($p.Name)) {
      Send @($guard, "recordGaps(address,int32[])", $p.Value.token, $gaps[$p.Name])
      Write-Host "    $($p.Name) seeded"
    }
  }

  Write-Host "4/4 Wiring into markets..." -ForegroundColor Yellow
  foreach ($p in $dep.markets.PSObject.Properties) {
    Send @($p.Value.market, "setGapGuard(address)", $guard)
    Write-Host "    $($p.Name) market -> GapGuard"
  }

  Write-Host ""
  Write-Host "Done. GapGuard: $guard" -ForegroundColor Green
}
finally {
  Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
}
