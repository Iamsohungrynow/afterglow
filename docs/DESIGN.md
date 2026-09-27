# Design: fixed-rate USDG credit lines on tokenized stocks

**Afterglow**: credit that stays alive after the market goes dark. Its session-aware oracle is **Phaselock**, phase-locked to the US equity market clock.

A term-lending market on Robinhood Chain. Holders of Robinhood stock tokens borrow USDG
at a fixed rate until a fixed maturity; USDG lenders earn that fixed rate on the portion
of the pool that is lent. A session-aware oracle makes every risk decision follow the
US equity market clock instead of pretending stocks trade 24/7.

## Problem

- **Borrowers** (non-US holders of tokenized stocks, often large balances): want cash
  without selling (tax, conviction). TradFi pledged-asset lines need $100k+ minimums,
  bank hours and floating rates; Robinhood itself offers only margin.
- **Lenders** (USDG holders; ~$689M USDG on Robinhood Chain, mostly in a ~3.6% net vault):
  want a known return for a known term, backed by over-collateralised blue-chip equity.
- **Existing on-chain stock lending ignores the market clock.** Price feeds freeze from
  Friday 20:00 ET to Sunday 20:00 ET. Current venues either keep lending against the
  frozen price, freeze *everything* (including exits), or list pre-close buffers as
  "planned". Nobody offers fixed terms.

## Evidence (retrieved 2026-09-27)

| Signal | Figure | Source |
|---|---|---|
| Schwab Pledged Asset Line balances | $33.4B, +59% YoY (2Q26) | Schwab 2Q26 8-K |
| Morgan Stanley households using a lending product | 18% (vs 14% five years ago) | MS 1Q26 call |
| Tokenized stocks, all chains | $3.14B, 4.0M holders | rwa.xyz |
| Robinhood Chain stock tokens | 195 active assets, chain 4663 | api.robinhood.com/rhj/assets |
| USDG on Robinhood Chain | $689.27M (`totalSupply()`) | RPC call |
| Fixed-term on-chain credit demand | Maple $4.8B AUM | KuCoin, Sep 2026 |
| Existing Robinhood Chain stock lenders | Cluby (Morpho, $147k cap), Denar (freezes on stale feed), Arrow (CDP; pre-close buffer "planned") | project sites/docs |

## Stock-token facts the contracts rely on

- Tokens are upgradeable ERC-20, 18 decimals, ERC-8056 "Scaled UI Amount".
  Raw `balanceOf` never changes on corporate actions; `uiMultiplier()` (1e18 = 1.0) does.
- **The Chainlink feed price is per raw token and already includes the multiplier**, so
  collateral value = `balanceOf × feedPrice`. Never apply the multiplier twice.
- Corporate actions: the issuer pauses the oracle (`oraclePaused()`, advisory only), stages
  `newUIMultiplier()` with `effectiveAt()`, then unpauses. Staleness checks are the real guard.
- Feeds are `AggregatorV3Interface`, typically 8 decimals, updated 24/5; off-hours they hold
  the last value with no heartbeat and no market-status field.
- Sold outside the US, UK, Canada, Switzerland and UAE.

## Mechanism

### One market = one collateral token + USDG + one maturity + one fixed rate

- Lenders deposit USDG and receive ERC-4626 shares. Shares accrete toward par at maturity.
- A borrower who takes `P` USDG at time `t` owes face value
  `F = P × (1 + r × (T − t) / year)` at maturity `T`.
- Because every loan in a market shares the same rate and maturity, the value of all
  outstanding debt is `totalFace × discount(t)` with
  `discount(t) = 1 / (1 + r × (T − t) / year)`. Accounting is O(1).
- Repaying early costs `F × discount(now)`: interest is paid only for the time used.
- Lender return = `r × utilisation`. Idle USDG earns nothing (stated plainly in the UI).
- After `T + grace`, any unpaid position is in default and fully liquidatable.

### Session-aware risk (the novel part)

`PhaselockOracle` classifies every price read:

| Session | When | Borrow | Withdraw collateral | Liquidate |
|---|---|---|---|---|
| **Live** | Feed fresh | up to base LTV | if LTV ≤ base LTV | yes |
| **Closing** | Feed fresh, inside the window before the weekly close | max LTV ramps linearly from base to weekend LTV | if LTV ≤ ramped LTV | yes |
| **Closed** | Feed stale (weekend, holiday, overnight gap) | no | only if LTV ≤ weekend LTV at the last price | no (no fair price, no exit liquidity) |
| **Halted** | Sequencer down, `oraclePaused()`, corporate action in progress, invalid price | no | no | no |

Repaying and adding collateral are allowed in every session, and repay is never pausable.

Why this shape:
- The pre-close ramp means nobody can open a max-LTV loan minutes before a 56-hour price freeze.
- Existing positions are never liquidated *because of* the ramp; it only limits new risk.
- Borrowers can always de-risk over the weekend, unlike a full freeze.
- Liquidating against a frozen price is unfair to borrowers and pointless without exit liquidity,
  so it waits for the first fresh price.
- The gap between weekend LTV and the liquidation threshold is the per-asset weekend gap buffer.

### Illustrative parameters (tune per asset)

| Asset class | Base LTV | Weekend LTV | Liquidation LTV | Bonus |
|---|---|---|---|---|
| Broad ETF (SPY, QQQ) | 70% | 60% | 77% | 5% |
| Mega-cap stock (NVDA, AAPL) | 55% | 45% | 65% | 7% |

## Contracts

| Contract | Role |
|---|---|
| `PhaselockOracle` | Normalises Chainlink prices to 1e18 USD per token; returns price + session + ramp progress |
| `AfterglowMarket` | ERC-4626 lender shares; collateral, borrow, repay, liquidate; session-aware limits |

Safety choices: internal cash accounting (donations do not move share price), ERC-4626
decimals offset against inflation attacks, `nonReentrant` on every external state change,
`Ownable2Step`, guardian pause that never blocks repay or collateral top-ups.

## Known limits (v1)

- USDG is valued at $1. A USDG/USD feed can be added to `PhaselockOracle` later.
- One rate per market; changing the rate means opening a new maturity.
- Liquidators need their own route to sell stock tokens (thin DEX liquidity).
- DST: the weekly close offset is owner-set and must be updated twice a year.
