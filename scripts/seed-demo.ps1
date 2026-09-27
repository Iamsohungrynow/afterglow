# Seeds one testnet market with demo activity so the app shows real numbers: a Boost deposit, a
# Protected deposit, stock collateral and a fixed-rate borrow, then runs the weekend sweep.
#
#   powershell -ExecutionPolicy Bypass -File scripts\seed-demo.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\seed-demo.ps1 -Symbol AMZN -Boost 50 -Protected 150 -Collateral 1 -Borrow 100
#
# Amounts are in whole tokens (USDG, stock). Boost goes in first: Protected deposits are refused while
# Boost would be under 20% of the vault. The borrow needs a live market (weekdays, after the Sunday-night
# reopen and the keeper's first fresh price); outside that it is skipped with a message, and you can run
# the script again later with -Boost 0 -Protected 0 -Collateral 0.
# Get test USDG at faucet.paxos.com and test stock tokens at faucet.testnet.chain.robinhood.com first.
# Signs with the encrypted Foundry keystore "deployer".

param(
  [string]$Symbol = "TSLA",
  [decimal]$Boost = 100,
  [decimal]$Protected = 300,
  [decimal]$Collateral = 1,
  [decimal]$Borrow = 150,
  [string]$Me = "0x670ff60b857007295D3DfC4B2009203163BBA9B8",
  [string]$Rpc = "https://rpc.testnet.chain.robinhood.com",
  [string]$ChainId = "46630"
)
$ErrorActionPreference = "Stop"
$env:Path += ";$HOME\.foundry\bin"
$root = Split-Path $PSScriptRoot -Parent
$keystore = Join-Path $HOME ".foundry\keystores\deployer"
$dep = Get-Content (Join-Path $root "deployments\$ChainId.json") -Raw | ConvertFrom-Json
$m = $dep.markets.$Symbol
if (-not $m) { throw "No $Symbol market in deployments\$ChainId.json" }

function Units([decimal]$amount, [int]$decimals) { (& cast parse-units "$amount" $decimals).Trim() }
function Read1([string]$to, [string]$sig) { ((& cast call $to $sig @args --rpc-url $Rpc) -split "\s")[0] }

$me = $Me
$usdgBal = [decimal](Read1 $dep.usdg "balanceOf(address)(uint256)" $me) / 1e6
$stockBal = [decimal](Read1 $m.token "balanceOf(address)(uint256)" $me) / 1e18
$session = @("Live", "Closing", "Closed", "Halted")[[int](Read1 $m.market "marketStatus()(uint8,uint256,uint256,uint256)")]

Write-Host "$Symbol market $($m.market), session $session"
Write-Host "Deployer $me holds $usdgBal USDG and $stockBal $Symbol"
Write-Host "Plan: Boost $Boost, Protected $Protected, collateral $Collateral $Symbol, borrow $Borrow USDG"
if ($Boost + $Protected -gt $usdgBal) { throw "Not enough USDG: need $($Boost + $Protected), have $usdgBal (faucet.paxos.com)" }
if ($Collateral -gt $stockBal) { throw "Not enough $Symbol : need $Collateral, have $stockBal (faucet.testnet.chain.robinhood.com)" }
if ($Protected -gt 0 -and $Boost -lt $Protected / 4) { throw "Boost must be at least a quarter of Protected (20% of the vault)" }
$live = $session -eq "Live" -or $session -eq "Closing"
if ($Borrow -gt 0 -and -not $live) { Write-Host "Market is $session : the borrow will be skipped this run." -ForegroundColor Yellow }
if ((Read-Host "Go ahead? Type yes") -ne "yes") { Write-Host "Cancelled."; exit 1 }

$secure = Read-Host "Keystore password for 'deployer'" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pwFile = New-TemporaryFile
try {
  [IO.File]::WriteAllText($pwFile, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr))
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

  function Send([string]$label, [string[]]$castArgs) {
    $out = & cast send @castArgs --keystore $keystore --password-file $pwFile --rpc-url $Rpc --json
    if ($LASTEXITCODE -ne 0) { throw "$label failed" }
    $r = $out | ConvertFrom-Json
    if ($r.status -ne "0x1") { throw "$label reverted: $($r.transactionHash)" }
    Write-Host "  $label  $($r.transactionHash)"
  }

  $usdgNeeded = Units ($Boost + $Protected) 6
  if ($Boost + $Protected -gt 0) { Send "approve USDG -> tranches" @($dep.usdg, "approve(address,uint256)", $m.tranches, $usdgNeeded) }
  if ($Boost -gt 0) { Send "deposit Boost $Boost" @($m.tranches, "depositJunior(uint256,address)", (Units $Boost 6), $me) }
  if ($Protected -gt 0) { Send "deposit Protected $Protected" @($m.tranches, "depositSenior(uint256,address)", (Units $Protected 6), $me) }

  if ($Collateral -gt 0) {
    $c = Units $Collateral 18
    Send "approve $Symbol -> market" @($m.token, "approve(address,uint256)", $m.market, $c)
    Send "pledge $Collateral $Symbol" @($m.market, "depositCollateral(uint256,address)", $c, $me)
  }
  if ($Borrow -gt 0 -and $live) { Send "borrow $Borrow USDG at the fixed rate" @($m.market, "borrow(uint256,address)", (Units $Borrow 6), $me) }

  # The keeper would do this within 30 minutes; doing it now shows the sweep straight away.
  Send "rebalance (weekend sweep)" @($m.market, "rebalance()")
} finally {
  Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
}

$cash = [decimal](Read1 $m.market "cash()(uint256)") / 1e6
$idle = [decimal](Read1 $m.market "idleAssets()(uint256)") / 1e6
$total = [decimal](Read1 $m.market "totalAssets()(uint256)") / 1e6
Write-Host "Done. $Symbol pool: $total USDG total, $cash cash, $idle in the savings vault, $($total - $cash - $idle) lent." -ForegroundColor Green
