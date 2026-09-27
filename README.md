# Afterglow

**Live:** https://afterglow-credit.vercel.app

Afterglow is a fixed-rate USDG credit line against tokenized stocks on Robinhood Chain. The market closes,
but your credit line doesn't: a market-hours oracle and a Stylus gap-risk model keep weekends safe, and lenders
choose Protected yield or Boost yield that absorbs losses first.

- **Borrowers** pledge stock tokens (NVDA, SPY, …) and borrow USDG at a fixed rate until a fixed maturity.
- **Lenders** deposit USDG into an ERC-4626 market whose shares accrete to par at maturity.
- **Session-aware risk**: borrowing capacity ramps down before the weekly close, borrowing stops
  while prices are stale, liquidations wait for a fresh price, and repaying or topping up
  collateral always works.

See [docs/DESIGN.md](docs/DESIGN.md) for the problem, market evidence and mechanism.

## Contracts

| Contract | Purpose |
|---|---|
| [`PhaselockOracle`](src/PhaselockOracle.sol) | Chainlink price + market session (Live / Closing / Closed / Halted), corporate-action and sequencer aware |
| [`AfterglowMarket`](src/AfterglowMarket.sol) | One collateral, one maturity, one fixed rate; ERC-4626 lender shares; borrow, repay, liquidate |
| [`AfterglowTranches`](src/AfterglowTranches.sol) | Splits a market's lenders into Protected (senior, fixed target rate, paid first) and Boost (junior, residual yield, first loss); junior must stay at least 20% |
| [`GapGuard`](stylus/gap-guard/src/lib.rs) (Rust, Arbitrum Stylus) | EWMA model of each stock's Friday-close → Monday-open gaps; tightens the weekend LTV after volatile weekends. Uses OpenZeppelin Contracts for Stylus |

Phaselock knows **when** the market is closed. GapGuard knows **how far it can jump** while closed.
Prices are quoted in USDG through Chainlink's USDG/USD feed, and everything halts if USDG leaves a ±2% band.

## Sponsor stack

| Sponsor tool | Used for |
|---|---|
| Robinhood Chain | Home chain: real stock tokens (NVDA, SPY, QQQ) and USDG |
| Paxos USDG | Loan asset; priced by Chainlink USDG/USD with a depeg circuit breaker |
| Arbitrum Stylus + OpenZeppelin Contracts for Stylus | `GapGuard` risk model in Rust |
| Arbitrum Sepolia | Second deployment target |
| OpenZeppelin Contracts (Solidity) | ERC-4626, access control, pausing, reentrancy guards |

## Development

Requires [Foundry](https://getfoundry.sh).

```bash
forge build
forge test                                             # unit + fuzz tests, offline
FORK=true forge test --match-path "test/fork/*"        # against Robinhood Chain mainnet state
cd stylus/gap-guard && cargo test                      # GapGuard (Rust) unit tests
```

## Deploy

[`script/Deploy.s.sol`](script/Deploy.s.sol) deploys `PhaselockOracle` plus one market per collateral and
writes the addresses to `deployments/<chainId>.json`.

| Network | Collateral | Prices | Supply cap |
|---|---|---|---|
| Robinhood Chain testnet (46630) | faucet TSLA, AMZN | `DemoPriceFeed` (owner-updated, testnet only) | none |
| Robinhood Chain (4663) | NVDA, SPY, QQQ | Chainlink | 1,000 USDG per market |
| Arbitrum Sepolia (421614) | `DemoStockToken` NVDA, SPY (public faucet) | `DemoPriceFeed` | none |

```bash
# one-time: store the deployer key in an encrypted keystore (never in .env)
cast wallet import deployer --interactive

# dry run, then broadcast and verify on Blockscout
forge script script/Deploy.s.sol --rpc-url robinhood_testnet --account deployer
forge script script/Deploy.s.sol --rpc-url robinhood_testnet --account deployer --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
```

### GapGuard (Stylus)

```bash
cd stylus/gap-guard && ./build.sh
cargo stylus check  --wasm-file target/wasm32-unknown-unknown/release/gap_guard.wasm --endpoint <rpc>
cargo stylus deploy --wasm-file target/wasm32-unknown-unknown/release/gap_guard.wasm --endpoint <rpc> --account deployer
cast send <gapGuard> "initialize(address)" <owner> --account deployer --rpc-url <rpc>   # then check owner()

# seed with real weekend history from the Chainlink feed, e.g. NVDA on Robinhood Chain
node scripts/weekend-gaps.mjs 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15
cast send <gapGuard> "recordGaps(address,int32[])" <nvdaToken> '[86,88,1,...]' --account deployer --rpc-url <rpc>
```

Then pass `GAP_GUARD=<gapGuard>` to the deploy script to wire it into every market.
On Windows, `cargo-stylus` 0.10.9 needs its unix-only debugger compiled out, and `stylus-proc` is patched
locally (see [`stylus/patches`](stylus/patches)) so the macro crate links under MSVC.

Optional env: `RATE_WAD` (default `0.08e18`), `TERM_DAYS` (28; maturity snaps to the next Thursday 20:00 UTC),
`SUPPLY_CAP` (loan-token units).

Testnet demo: move a price with `cast send <feed> "publish(int256)" 30000000000 --account deployer --rpc-url robinhood_testnet`
($300.00 at 8 decimals). Get test ETH and stock tokens from `faucet.testnet.chain.robinhood.com` and test USDG from `faucet.paxos.com`.

After US daylight saving ends (1 Nov 2026) the owner must shift the weekly close by one hour:
`setSchedule(5 days + 1 hours, 2 days, 4 hours, 1 hours)`.

## Web app

[`web/`](web) is a Next.js app: a landing page and a trading terminal at `/app`.

- Reads live Chainlink prices from Robinhood Chain mainnet, so it works in preview mode before any deployment.
- After a deployment, `node web/scripts/sync-deployments.mjs` copies `deployments/*.json` into the app, and the terminal
  switches to the deployed markets on that chain.
- With a ZeroDev project ID in `web/.env.local` (see `web/.env.example`), borrowers get a Kernel smart account with
  sponsored gas on Robinhood Chain testnet and Arbitrum Sepolia: approve, deposit and borrow settle in one user operation.

```bash
cd web && npm install && npm run dev
```

## Status

Hackathon build for Arbitrum Open House Singapore (Sep–Oct 2026). Unaudited; do not use with real funds.
