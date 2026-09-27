-- Afterglow: GapGuard's weekend LTV, recomputed on Dune from the weekend gaps query.
-- Replace query_<WEEKEND_GAPS_ID> with the id Dune assigns to weekend-gaps.sql.
--
-- Mirrors stylus/gap-guard exactly: var_0 = g_0², var_n = λ·var_(n-1) + (1-λ)·g_n² with λ = 0.90,
-- buffer = 3σ clamped to [5%, 50%] (50% until 8 weekends are recorded),
-- weekend LTV = liquidation LTV × (1 - buffer). Liquidation LTV: 65% stocks, 77% ETFs.
-- Unrolled: every gap weighs (1-λ)·λ^age except the oldest, which weighs λ^age (age 0 = newest).

WITH gaps AS (
    SELECT
        symbol,
        gap_bps AS g,
        row_number() OVER (PARTITION BY symbol ORDER BY reopen_monday_utc DESC) - 1 AS age,
        count(*) OVER (PARTITION BY symbol) AS n
    FROM query_<WEEKEND_GAPS_ID>
),

model AS (
    SELECT
        symbol,
        max(n) AS weekends,
        max(abs(g)) AS worst_gap_bps,
        sqrt(sum(
            CASE WHEN age = n - 1 THEN power(0.90, age) ELSE 0.10 * power(0.90, age) END * g * g
        )) AS sigma_bps
    FROM gaps
    GROUP BY 1
),

buffered AS (
    SELECT
        *,
        CASE WHEN symbol IN ('SPY', 'QQQ') THEN 7700 ELSE 6500 END AS liq_ltv_bps,
        CASE WHEN weekends < 8 THEN 5000 ELSE greatest(500, least(5000, 3 * sigma_bps)) END AS buffer_bps
    FROM model
)

SELECT
    symbol,
    weekends,
    worst_gap_bps / 100.0 AS worst_gap_pct,
    ROUND(sigma_bps / 100, 2) AS sigma_pct,
    ROUND(buffer_bps / 100, 2) AS gap_buffer_pct,
    liq_ltv_bps / 100.0 AS liquidation_ltv_pct,
    ROUND(liq_ltv_bps * (1 - buffer_bps / 1e4) / 100, 2) AS weekend_ltv_pct
FROM buffered
ORDER BY symbol
