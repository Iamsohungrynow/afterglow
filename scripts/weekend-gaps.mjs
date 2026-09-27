#!/usr/bin/env node
// Extracts historical weekend gaps (Friday's last print -> first print after the Sunday-night
// reopen) from a Chainlink feed's round history on Robinhood Chain, for seeding GapGuard.
//
//   node scripts/weekend-gaps.mjs <feed> [rpc]
//
// Prints one line per weekend and, last, a JSON array of gaps in bps (oldest first) ready for
// `cast send <gapGuard> "recordGaps(address,int32[])" <token> '<array>'`.
// No dependencies: plain JSON-RPC over fetch (Node 18+).

const FEED = process.argv[2];
const RPC = process.argv[3] ?? "https://rpc.mainnet.chain.robinhood.com";
if (!FEED) {
  console.error("usage: node scripts/weekend-gaps.mjs <feed> [rpc]");
  process.exit(1);
}

const LATEST = "0xfeaf968c"; // latestRoundData()
const GET_ROUND = "0x9a6fc8f5"; // getRoundData(uint80)
const WEEK = 7 * 86400;
const MONDAY_SHIFT = 3 * 86400; // unix 0 was a Thursday
const CLOSE_OFFSET = 5 * 86400; // Saturday 00:00 UTC (Friday 20:00 ET, EDT)
const WEEKEND = 2 * 86400;

async function rpc(batch) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(batch),
  });
  const out = await res.json();
  if (!Array.isArray(out)) throw new Error("RPC error: " + JSON.stringify(out).slice(0, 200));
  return out.sort((a, b) => a.id - b.id);
}

const call = (id, data) => ({
  jsonrpc: "2.0",
  id,
  method: "eth_call",
  params: [{ to: FEED, data }, "latest"],
});

function decode(hex) {
  const w = (i) => BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
  let answer = w(1);
  if (answer >= 1n << 255n) answer -= 1n << 256n;
  return { roundId: w(0), answer, updatedAt: Number(w(3)) };
}

const intoWeek = (t) => (t + MONDAY_SHIFT) % WEEK;
const isWeekend = (t) => (intoWeek(t) - CLOSE_OFFSET + WEEK) % WEEK < WEEKEND;
const weekIndex = (t) => Math.floor((t + MONDAY_SHIFT - CLOSE_OFFSET) / WEEK); // changes at each close

async function main() {
  const [latest] = await rpc([call(1, LATEST)]);
  const head = decode(latest.result);
  const phase = head.roundId >> 64n;
  const last = head.roundId & ((1n << 64n) - 1n);

  const rounds = [];
  const CHUNK = 20n; // public RPC batch limit
  for (let start = 1n; start <= last; start += CHUNK) {
    const batch = [];
    for (let r = start; r < start + CHUNK && r <= last; r++) {
      const id = (phase << 64n) | r;
      batch.push(call(Number(r), GET_ROUND + id.toString(16).padStart(64, "0")));
    }
    for (const x of await rpc(batch)) if (x.result && x.result.length > 2) rounds.push(decode(x.result));
  }
  rounds.sort((a, b) => a.updatedAt - b.updatedAt);

  // For each weekly close: last print before it, first print after the reopen.
  const gaps = [];
  for (let i = 1; i < rounds.length; i++) {
    const prev = rounds[i - 1];
    const cur = rounds[i];
    if (weekIndex(cur.updatedAt) === weekIndex(prev.updatedAt)) continue; // same trading week
    if (isWeekend(cur.updatedAt) || isWeekend(prev.updatedAt)) continue;
    const bps = Number(((cur.answer - prev.answer) * 10000n) / prev.answer);
    gaps.push(bps);
    console.log(
      `${new Date(prev.updatedAt * 1000).toISOString()} ${Number(prev.answer) / 1e8} -> ` +
        `${new Date(cur.updatedAt * 1000).toISOString()} ${Number(cur.answer) / 1e8}  gap ${bps} bps`
    );
  }

  const sd = Math.sqrt(gaps.reduce((s, g) => s + g * g, 0) / Math.max(gaps.length, 1));
  console.log(`# ${rounds.length} rounds, ${gaps.length} weekends, RMS gap ${sd.toFixed(1)} bps`);
  console.log(JSON.stringify(gaps));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
