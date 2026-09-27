#!/usr/bin/env bash
# Mirrors Robinhood Chain mainnet Chainlink prices into the testnet DemoPriceFeeds.
#
# Robinhood Chain testnet has no Chainlink equity feeds, so the testnet markets read owner-published
# DemoPriceFeeds. This copies each mainnet print across, and only when mainnet has printed since the
# testnet feed was last updated. The testnet therefore follows real prices and freezes when mainnet
# freezes (the weekend close), so Phaselock sees the same sessions it would see on mainnet.
#
#   MIRROR_PRIVATE_KEY=0x... bash scripts/mirror-prices.sh          # key that owns the demo feeds
#   bash scripts/mirror-prices.sh --dry-run                          # show what would be published
#
# Runs every 30 minutes from .github/workflows/mirror-prices.yml. Needs Foundry's `cast` and node.
set -euo pipefail

MAINNET_RPC="${MAINNET_RPC:-https://rpc.mainnet.chain.robinhood.com}"
TESTNET_RPC="${TESTNET_RPC:-https://rpc.testnet.chain.robinhood.com}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1
if [[ $DRY_RUN == 0 && -z "${MIRROR_PRIVATE_KEY:-}" ]]; then
  echo "MIRROR_PRIVATE_KEY is not set (use --dry-run to only compare)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Chainlink feeds on Robinhood Chain mainnet (same as web/lib/markets.ts).
declare -A MAINNET_FEED=(
  [TSLA]=0x4A1166a659A55625345e9515b32adECea5547C38
  [AMZN]=0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C
  [USDG]=0x61B7e5650328764B076A108EFF5fa7282a1B9aD2
)

# "SYMBOL testnetFeed" lines from the testnet deployment file.
pairs=$(node -e '
  const d = require(process.argv[1]);
  for (const [s, m] of Object.entries(d.markets)) console.log(s, m.feed);
  console.log("USDG", d.usdgFeed);
' "$ROOT/deployments/46630.json")

# latestRoundData() -> "answer updatedAt" (cast prints one value per line, with a [sci] suffix).
read_round() {
  cast call "$1" "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url "$2" |
    awk 'NR==2{a=$1} NR==3{u=$1} END{print a, u}'
}

status=0
while read -r sym testnet_feed; do
  src="${MAINNET_FEED[$sym]:-}"
  if [[ -z "$src" ]]; then
    echo "$sym: no mainnet feed configured, skipped"
    continue
  fi
  read -r m_answer m_updated < <(read_round "$src" "$MAINNET_RPC")
  read -r t_answer t_updated < <(read_round "$testnet_feed" "$TESTNET_RPC")

  if (( m_updated <= t_updated )); then
    echo "$sym: up to date ($t_answer, mainnet printed $(( ($(date +%s) - m_updated) / 60 )) min ago)"
    continue
  fi
  if (( DRY_RUN )); then
    echo "$sym: would publish $m_answer (testnet has $t_answer)"
    continue
  fi
  if cast send "$testnet_feed" "publish(int256)" "$m_answer" \
    --private-key "$MIRROR_PRIVATE_KEY" --rpc-url "$TESTNET_RPC" >/dev/null; then
    echo "$sym: published $m_answer (was $t_answer)"
  else
    echo "$sym: publish FAILED" >&2
    status=1
  fi
done <<< "$pairs"
exit $status
