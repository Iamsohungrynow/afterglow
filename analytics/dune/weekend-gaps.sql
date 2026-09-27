-- Afterglow: weekend gaps of Robinhood Chain stock tokens (Dune, schema `robinhood`).
--
-- The same dataset GapGuard is calibrated on (scripts/weekend-gaps.mjs), reproduced from raw
-- Chainlink `AnswerUpdated` logs so anyone can audit the weekend LTV:
--   Friday close  = last print before Sat 00:00 UTC (Fri 20:00 ET, EDT)
--   Sunday reopen = first print at or after Mon 00:00 UTC (Sun 20:00 ET, EDT)
--   gap_bps       = (reopen / friday_close - 1) * 10,000
-- Aggregators are the current `aggregator()` of each feed proxy listed in web/lib/markets.ts.

WITH feeds (symbol, aggregator) AS (
    VALUES
        ('TSLA', 0x7a6b81ba7fbcb90104d8c496158cf383cd7233b1),
        ('AMZN', 0x93503dfc97157cdb8aadccaf70452621d598fdeb),
        ('NVDA', 0xc9d16e4f2569b9e3ea0468fd85844953713dc2a2),
        ('SPY',  0x78bcb218fa04b9b3a278ebc865ed320bf8defbac),
        ('QQQ',  0x25e996ce8b3529885d429241156e83e7b7744049)
),

prints AS (
    SELECT
        f.symbol,
        l.block_time,
        CAST(bytearray_to_int256(l.topic1) AS DOUBLE) / 1e8 AS price
    FROM robinhood.logs l
    JOIN feeds f ON l.contract_address = f.aggregator
    WHERE l.topic0 = 0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f -- AnswerUpdated
),

friday_close AS (
    SELECT
        symbol,
        date_trunc('week', block_time) + INTERVAL '7' DAY AS reopen_week,
        max_by(price, block_time) AS close_price
    FROM prints
    WHERE block_time < date_trunc('week', block_time) + INTERVAL '5' DAY
    GROUP BY 1, 2
),

sunday_reopen AS (
    SELECT
        symbol,
        date_trunc('week', block_time) AS reopen_week,
        min_by(price, block_time) AS reopen_price,
        min(block_time) AS reopen_time
    FROM prints
    GROUP BY 1, 2
)

SELECT
    r.symbol,
    CAST(r.reopen_week AS DATE) AS reopen_monday_utc,
    c.close_price AS friday_close,
    r.reopen_price AS sunday_reopen,
    ROUND((r.reopen_price / c.close_price - 1) * 1e4) AS gap_bps
FROM sunday_reopen r
JOIN friday_close c ON c.symbol = r.symbol AND c.reopen_week = r.reopen_week
ORDER BY r.reopen_week DESC, r.symbol
