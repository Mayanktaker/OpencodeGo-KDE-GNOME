// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Node-driven checks for contents/code/api.js (the QML JS library): the file has
// no exports, so it runs in a vm context and its globals are asserted directly.
// Run by .github/workflows/validate.sh — no Qt or display needed.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'contents/code/api.js'), 'utf8');
const ctx = vm.createContext({ console, Date, Math, JSON, Number, Object, String });
vm.runInContext(src, ctx, { filename: 'api.js' });

let failures = 0;
const ok = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); failures++; } };
const eq = (a, b, msg) => ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const WS = 'wrk_node1234567890';
// Parsed-payload builder with real micro-cent meters, matching parseConsoleGoStatus output
const data = percents => ({
    isMock: false,
    resetSeconds: { hourly: 3600, weekly: 3 * 86400, monthly: 20 * 86400 },
    hourly: [{ usedMicroCents: percents.h * 1e7, limitMicroCents: 1e9 }],
    weekly: [{ usedMicroCents: percents.w * 2e7, limitMicroCents: 2e9 }],
    monthly: [{ usedMicroCents: percents.m * 2e8, limitMicroCents: 2e10 }],
});

// The console serializes BigInt micro-cents as strings; the history path must accept both
const stringy = data({ h: 50, w: 40, m: 20 });
stringy.weekly[0].usedMicroCents = '800000000';
stringy.weekly[0].limitMicroCents = '2000000000';
const stringStore = ctx.historyAppend(null, 'wrk_strings', stringy, 1000000);
eq(stringStore.samples.length, 1, 'string-typed micro-cents still sample');
eq(ctx.historyTrend(stringStore, 'weekly', 1000000)[0].pct, 40, 'string micro-cents derive the right percent');

// --- append: dedupe, cap, workspace reset, mock rejection ---
let store = ctx.historyAppend(null, WS, data({ h: 50, w: 40, m: 20 }), 1000000);
eq(store.samples.length, 1, 'append adds one sample');
eq(store.ws, WS, 'store keyed to workspace');
store = ctx.historyAppend(store, WS, data({ h: 51, w: 41, m: 21 }), 1000000 + 60000);
eq(store.samples.length, 1, 'append inside the 5-minute gap refreshes the same sample');
store = ctx.historyAppend(store, WS, data({ h: 52, w: 42, m: 22 }), 1000000 + 60000 + 300001);
eq(store.samples.length, 2, 'append past the gap records a new sample');
const swapped = ctx.historyAppend(store, 'org_other', data({ h: 1, w: 1, m: 1 }), 2000000);
eq(swapped.samples.length, 1, 'workspace mismatch resets the series');
const mocked = ctx.historyAppend(null, WS, { isMock: true, hourly: [], weekly: [], monthly: [] }, 3000000);
eq(mocked.samples.length, 0, 'mock data never samples');

// --- config round trip through the JSON string ---
const persisted = JSON.stringify(store);
const reloaded = ctx.historyFromConfig(persisted, WS);
eq(reloaded.samples.length, store.samples.length, 'config round trip keeps samples');
eq(ctx.historyFromConfig(persisted, 'wrk_elsewhere').samples.length, 0, 'foreign workspace ignored');
eq(ctx.historyFromConfig('{oops', WS).samples.length, 0, 'corrupt string degrades to empty');
eq(ctx.historyFromConfig('', WS).samples.length, 0, 'empty string degrades to empty');

// --- pace: slope, projection, silence on decline or thin data ---
const now = Date.now();
const paced = { ws: WS, samples: [
    { t: now - 30 * 60000, m: { weekly: [4e8, 1e9] } },
    { t: now, m: { weekly: [7e8, 1e9] } },
] };
const pace = ctx.historyPace(paced, 'weekly', 3600, now);
ok(pace, 'upward climb yields a pace estimate');
eq(Math.round(pace.ratePctPerHour), 60, 'slope is 30% over half an hour');
ok(pace.projectedPct >= 130 && pace.projectedPct < 131, 'weekly projected past 100% before reset');
const declined = { ws: WS, samples: [
    { t: now - 30 * 60000, m: { weekly: [7e8, 1e9] } },
    { t: now, m: { weekly: [4e8, 1e9] } },
] };
ok(ctx.historyPace(declined, 'weekly', 3600, now) === null, 'declining usage stays silent');
ok(ctx.historyPace(paced, 'weekly', 0, now) === null, 'unknown reset window stays silent');
eq(ctx.historyPaceText(pace), '⚠ ~130%', 'over-limit projection warns');
eq(ctx.historyPaceText({ ratePctPerHour: 1, projectedPct: 84.4 }), '↗ ~84%', 'on-pace projection reads calmly');
eq(ctx.historyPaceText(null), '', 'no pace renders no chip');

// --- trend window trimming ---
const trend = ctx.historyTrend({ ws: WS, samples: [
    { t: now - 25 * 3600000, m: { weekly: [1e8, 1e9] } },
    { t: now - 3600000, m: { weekly: [5e8, 1e9] } },
    { t: now, m: { weekly: [6e8, 1e9] } },
] }, 'weekly', now);
eq(trend.length, 2, 'samples older than 24h drop out');
eq(trend[trend.length - 1].pct, 60, 'percent derived from micro-cents');

// --- sample cap keeps the config blob small ---
const flooded = { ws: WS, samples: [] };
for (let i = 0; i < ctx.HISTORY_MAX_SAMPLES + 10; i++) {
    flooded.samples.push({ t: i * ctx.HISTORY_MIN_GAP_MS, m: { weekly: [1e8, 1e9] } });
}
const settled = ctx.historyAppend(flooded, WS, data({ h: 9, w: 9, m: 9 }), (ctx.HISTORY_MAX_SAMPLES + 10) * ctx.HISTORY_MIN_GAP_MS + 1);
eq(settled.samples.length, ctx.HISTORY_MAX_SAMPLES, 'series capped at the maximum sample count');
ok(JSON.stringify(settled).length < 40000, 'capped store stays a small config blob');

if (failures > 0) { console.error(`${failures} kde api test(s) failed`); process.exit(1); }
console.log('All kde api tests passed');
