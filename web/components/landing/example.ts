import { BASE_RATE_PCT, MARKETS, PROTECTED_TARGET_PCT, gapModel, premiumAprPct, premiumPpmFromSigma } from "@/lib/markets";

// The landing page's and docs' worked example: the TSLA market (live on Robinhood Chain testnet),
// 100k USDG vault, 25% Boost, fully lent.
export const EXAMPLE_SYMBOL = "TSLA";
export const EXAMPLE_MARKET = MARKETS[EXAMPLE_SYMBOL];
const m = EXAMPLE_MARKET;

export const BASE = BASE_RATE_PCT;
export const TARGET = PROTECTED_TARGET_PCT;
export const SIGMA_BPS = gapModel(m.gaps, m.risk.liqLtvBps).sigma;
/** Weekend premium for the example stock, per weekend in bps and as a yearly rate in %. */
export const PREMIUM_BP = premiumPpmFromSigma(SIGMA_BPS) / 100;
export const PREMIUM_APR = premiumAprPct(premiumPpmFromSigma(SIGMA_BPS));
/** What a fully lent pool earns a year: the base rate plus the weekend premium. */
export const POOL_APR = BASE + PREMIUM_APR;

export const BOOST_SHARE = 0.25;
export const BOOST_APY = (POOL_APR - (1 - BOOST_SHARE) * TARGET) / BOOST_SHARE;
/** The part of Boost's yield that is weekend premium. */
export const BOOST_FROM_PREMIUM = PREMIUM_APR / BOOST_SHARE;
