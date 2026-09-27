# Hands the testnet DemoPriceFeeds (TSLA, AMZN, USDG) to a dedicated keeper wallet, so the price
# mirror (scripts/mirror-prices.sh, run by GitHub Actions) can publish without the deployer key.
# The keeper owns only these three demo feeds; markets, oracle and tranches stay with the deployer.
#
#   powershell -ExecutionPolicy Bypass -File scripts\set-price-keeper.ps1 -Keeper 0xKEEPER
#
# DemoPriceFeed uses one-step Ownable: a wrong address loses the feed for good, so this checks the
# address and asks for confirmation first. Signs with the encrypted Foundry keystore "deployer".

param(
  [Parameter(Mandatory = $true)][string]$Keeper,
  [string]$Rpc = "https://rpc.testnet.chain.robinhood.com",
  [string]$ChainId = "46630"
)
$ErrorActionPreference = "Stop"
$env:Path += ";$HOME\.foundry\bin"
$root = Split-Path $PSScriptRoot -Parent
$keystore = Join-Path $HOME ".foundry\keystores\deployer"
$dep = Get-Content (Join-Path $root "deployments\$ChainId.json") -Raw | ConvertFrom-Json

if ($Keeper -notmatch '^0x[0-9a-fA-F]{40}$') { throw "Keeper must be a 0x-prefixed 20-byte address" }
$Keeper = (& cast to-check-sum-address $Keeper).Trim()
if ($Keeper -eq "0x0000000000000000000000000000000000000000") { throw "Keeper cannot be the zero address" }

$feeds = [ordered]@{}
foreach ($p in $dep.markets.PSObject.Properties) { $feeds[$p.Name] = $p.Value.feed }
$feeds["USDG"] = $dep.usdgFeed

Write-Host "New owner (keeper): $Keeper"
foreach ($k in $feeds.Keys) { Write-Host ("  {0,-5} {1}  owner now {2}" -f $k, $feeds[$k], (& cast call $feeds[$k] "owner()(address)" --rpc-url $Rpc)) }
$ok = Read-Host "Transfer these feeds to $Keeper ? Type yes"
if ($ok -ne "yes") { Write-Host "Cancelled."; exit 1 }

$secure = Read-Host "Keystore password for 'deployer'" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pwFile = New-TemporaryFile
try {
  [IO.File]::WriteAllText($pwFile, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr))
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  foreach ($k in $feeds.Keys) {
    $out = & cast send $feeds[$k] "transferOwnership(address)" $Keeper --keystore $keystore --password-file $pwFile --rpc-url $Rpc --json
    if ($LASTEXITCODE -ne 0) { throw "cast send failed for $k" }
    if (($out | ConvertFrom-Json).status -ne "0x1") { throw "transferOwnership reverted for $k" }
    $now = (& cast call $feeds[$k] "owner()(address)" --rpc-url $Rpc).Trim()
    Write-Host "  $k owner -> $now"
  }
} finally {
  Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
}
Write-Host "Done. Add the keeper's private key as the GitHub secret MIRROR_PRIVATE_KEY." -ForegroundColor Green
