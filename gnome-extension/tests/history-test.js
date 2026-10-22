// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Plain-assert tests for the disk-backed usage history store (sparkline, pace, snapshot)

import GLib from 'gi://GLib';
import * as Api from '../api.js';
import * as History from '../history.js';

// Point the store at a scratch dir before any save/load; history.js reads the env
// override at call time, so a static import stays safe for the real shell too
const scratch = GLib.dir_make_tmp('opencodego-hist-XXXXXX') || '/tmp/opencodego-hist-test';
GLib.setenv('OPENCODEGO_CACHE_DIR', scratch, true);

// Minimal assert helpers so gjs runs without any dependency
let failures = 0;
function ok(cond, msg) {
    if (!cond) { console.error('FAIL: ' + msg); failures++; }
}
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

const WS = 'wrk_test1234567890';

// Builds a parsed usage payload (the shape api.js produces) with micro-cent meters
function liveData({ hourly, weekly, monthly }) {
    const bar = (used, limit) => limit > 0 ? [({
        label: 'bar',
        value: Api.meterPercent(used, limit),
        maxValue: 100,
        usedMicroCents: used,
        limitMicroCents: limit,
        usedFormatted: Api.formatCurrency(used),
        limitFormatted: Api.formatCurrency(limit),
        remainingFormatted: Api.formatCurrency(Math.max(0, limit - used)) + ' left',
    })] : [];
    return {
        isMock: false,
        usagePercent: (weekly || monthly || hourly || 0),
        resetSeconds: { hourly: 3600, weekly: 3 * 24 * 3600, monthly: 20 * 24 * 3600 },
        hourly: bar(hourly, 100000000),
        weekly: bar(weekly, 200000000),
        monthly: bar(monthly, 400000000),
        lastRefreshed: '12:00:00',
    };
}

// --- append builds samples, collapses near-instant refreshes ---
let store = null;
store = History.append(null, WS, liveData({ hourly: 50_000_000, weekly: 100_000_000, monthly: 200_000_000 }));
eq(store.samples.length, 1, 'append adds one sample');
eq(store.ws, WS, 'store keyed to workspace');
ok(Array.isArray(store.samples[0].m.weekly), 'sample carries weekly meter pair');

const firstT = store.samples[0].t;
store = History.append(store, WS, liveData({ hourly: 60_000_000, weekly: 110_000_000, monthly: 210_000_000 }));
eq(store.samples.length, 1, 'second append within the gap refreshes the same sample');
ok(store.samples[0].t >= firstT, 'refreshed sample carries the newest timestamp');

// --- a skipped append (mock data) never touches the store ---
const mockLike = { isMock: true, hourly: [], weekly: [], monthly: [] };
store = History.append(store, WS, mockLike);
eq(store.samples.length, 1, 'mock data never appends');

// --- different workspace starts a fresh series ---
let swapped = History.append(store, 'org_other00000', liveData({ hourly: 10_000_000, weekly: 10_000_000, monthly: 10_000_000 }));
eq(swapped.ws, 'org_other00000', 'workspace mismatch resets the store');
eq(swapped.samples.length, 1, 'fresh workspace has a single sample');

// --- pace estimation over time ---
const now = Date.now();
store = {
    ws: WS,
    samples: [
        { t: now - 30 * 60 * 1000, m: { weekly: [40_000_000, 100_000_000], monthly: [10_000_000, 100_000_000] } },
        { t: now, m: { weekly: [70_000_000, 100_000_000], monthly: [12_000_000, 100_000_000] } },
    ],
};
const pace = History.paceFor(store, 'weekly', 3600, now);
ok(pace, 'upward climb yields a pace estimate');
eq(Math.round(pace.ratePctPerHour), 60, 'slope is 30% over half an hour');
ok(pace.projectedPct >= 130 && pace.projectedPct < 131, 'weekly projected past 100% before reset');
eq(pace.etaSec, 1800, 'time-to-limit half an hour after the last sample');

const down = History.paceFor({
    ws: WS,
    samples: [
        { t: now - 30 * 60 * 1000, m: { weekly: [70_000_000, 100_000_000] } },
        { t: now, m: { weekly: [40_000_000, 100_000_000] } },
    ],
}, 'weekly', 3600, now);
ok(down === null, 'declining usage has no pace chip');

const thin = History.paceFor(store, 'monthly', 600, now);
ok(thin === null, 'tiny reset window under two samples stays silent');

// --- trend view trims outside the 24h window ---
const view = History.trendView({
    ws: WS,
    samples: [
        { t: now - 25 * 3600 * 1000, m: { weekly: [10_000_000, 100_000_000] } },
        { t: now - 3 * 3600 * 1000, m: { weekly: [50_000_000, 100_000_000] } },
        { t: now, m: { weekly: [60_000_000, 100_000_000] } },
    ],
}, now);
eq(view.weekly.length, 2, 'old samples outside the window are dropped');
ok(!('monthly' in view), 'meters without samples are omitted');
eq(view.weekly[0].pct, 50, 'percent derived from micro-cents');

// --- snapshot rebuilds a popup-ready payload from the newest sample ---
const snap = History.snapshotData(store);
ok(snap && snap.fromDisk === true, 'snapshot flags itself as restored from disk');
ok(snap.isMock === false, 'snapshot is live-shaped data');
eq(snap.weekly[0].value, 70, 'snapshot weekly percent matches the newest sample');
eq(snap.weekly[0].usedFormatted, '$0.70', 'snapshot currency formatted');
ok(History.snapshotData({ ws: WS, samples: [] }) === null, 'empty store yields no snapshot');

// --- save/load round trip through the scratch dir ---
const persisted = { ws: WS, samples: [{ t: now - 1000, m: { weekly: [50_000_000, 100_000_000] } }] };
ok(History.save(persisted), 'save writes the scratch file');
const reloaded = History.load(WS);
eq(reloaded.samples.length, 1, 'load restores the sample count');
eq(reloaded.samples[0].t, now - 1000, 'load restores the timestamp');

// --- foreign workspace and garbage files resolve to an empty store ---
eq(History.load('wrk_other00000').samples.length, 0, 'foreign workspace ignores the file');
ok(History.save({ ws: WS, samples: [{ t: 1000000, m: { weekly: [1, 1] } }] }), 'second save overwrites');
eq(History.load(WS).samples[0].t, 1000000, 'save is an atomic replace, not an append');

// --- corrupt file degrades to an empty store ---
GLib.file_set_contents(GLib.build_filenamev([scratch, 'history.json']), '{oops');
eq(History.load(WS).samples.length, 0, 'corrupt file degrades to an empty store');

// --- cap keeps the series bounded ---
const flooded = { ws: WS, samples: [] };
for (let i = 0; i < 2020; i++) flooded.samples.push({ t: 1000 + i, m: { weekly: [1000, 100000000] } });
const settled = History.append(flooded, WS, liveData({ hourly: 10_000_000, weekly: 20_000_000, monthly: 30_000_000 }));
eq(settled.samples.length, 2016, 'series capped at the maximum sample count');

// Summary and exit code for the runner
if (failures > 0) {
    printerr(failures + ' history test(s) failed');
    imports.system.exit(1);
} else {
    print('All history tests passed');
}
