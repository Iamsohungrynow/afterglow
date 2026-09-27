# Afterglow

Fixed-rate USDG credit lines against tokenized stocks on Robinhood Chain, with a risk engine
that follows the US equity market clock.

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

## Development

Requires [Foundry](https://getfoundry.sh).

```bash
forge build
forge test                                             # unit + fuzz tests, offline
FORK=true forge test --match-path "test/fork/*"        # against Robinhood Chain mainnet state
```

## Status

Hackathon build for Arbitrum Open House Singapore (Sep–Oct 2026). Unaudited; do not use with real funds.
