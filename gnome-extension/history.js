// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Disk-backed usage history: samples live figures for the sparkline, burn-rate pace
// estimate, and the "figures from the last session" snapshot shown before the first poll

import GLib from 'gi://GLib';
import * as Api from './api.js';

const HISTORY_VERSION = 1;

// Cap so the file stays a few KB: 7 days at one sample per 5-minute poll
const MAX_SAMPLES = 2016;

// Two samples closer than this are considered one observation and collapse
const MIN_SAMPLE_GAP_SEC = 60;

// Sparkline covers the newest 24 h of samples
const TREND_WINDOW_SEC = 24 * 3600;

// Slope estimation for the pace chip uses the newest 6 h within one reset window
const PACE_WINDOW_SEC = 6 * 3600;

// Meter chat keys reused across every view; order matches the popup rows
export const METER_KEYS = ['hourly', 'weekly', 'monthly'];
const METER_LABELS = { hourly: 'Rolling', weekly: 'Weekly', monthly: 'Monthly' };

// Store location: up to the test rig via env, otherwise the user's private XDG cache
export function cacheDir() {
    const override = GLib.getenv('OPENCODEGO_CACHE_DIR');
    if (override) return override;
    return GLib.build_filenamev([GLib.get_user_cache_dir(), 'opencodego-usage']);
}

function filePath() {
    return GLib.build_filenamev([cacheDir(), 'history.json']);
}

// Pulls u/l micro-cent numbers out of one parsed bar; null when realtime fields are absent
function meterOf(bar) {
    if (!bar || bar.usedMicroCents === undefined || bar.limitMicroCents === undefined) return null;
    return [Number(bar.usedMicroCents) || 0, Number(bar.limitMicroCents) || 0];
}

// Summarizes one parsed usage payload into the compact per-sample meter record
function sampleMetersFrom(data) {
    const meters = {};
    for (const key of METER_KEYS) {
        const m = meterOf((data[key] || [])[0]);
        if (m) meters[key] = m;
    }
    return Object.keys(meters).length ? meters : null;
}

function percentOf(meters, key) {
    const m = meters ? meters[key] : null;
    return m && m[1] > 0 ? Api.meterPercent(m[0], m[1]) : null;
}

// Loads the on-disk store, discarding anything the current workspace cannot reuse
export function load(wsId) {
    const empty = { version: HISTORY_VERSION, ws: wsId, samples: [] };
    let bytes;
    try {
        [, bytes] = GLib.file_get_contents(filePath());
    } catch (_) {
        return empty;
    }
    try {
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        if (!parsed || parsed.version !== HISTORY_VERSION || parsed.ws !== wsId || !Array.isArray(parsed.samples)) return empty;
        const samples = parsed.samples.filter(s => s && Number.isFinite(s.t) && s.m && typeof s.m === 'object');
        return { version: HISTORY_VERSION, ws: parsed.ws, samples };
    } catch (_) {
        return empty;
    }
}

// Appends one sample deduped against the newest entry; returns the updated store (not yet written)
export function append(store, wsId, data) {
    const meters = sampleMetersFrom(data);
    if (!store || store.ws !== wsId) store = { version: HISTORY_VERSION, ws: wsId, samples: [] };
    if (!meters) return store;
    const now = Date.now();
    const last = store.samples[store.samples.length - 1];
    if (last && (now - last.t) / 1000 < MIN_SAMPLE_GAP_SEC) {
        // Refresh the freshest record instead of stacking near-identical samples
        last.t = now;
        last.m = meters;
        return store;
    }
    store.samples.push({ t: now, m: meters });
    if (store.samples.length > MAX_SAMPLES) store.samples.splice(0, store.samples.length - MAX_SAMPLES);
    return store;
}

// Persists the store atomically; failures (readonly cache dir) only silence the trend
export function save(store) {
    if (!store || !Array.isArray(store.samples)) return false;
    try {
        // Version is stamped here so any store handed in serializes with the current schema
        GLib.mkdir_with_parents(cacheDir(), 0o700);
        GLib.file_set_contents(filePath(), JSON.stringify({
            version: HISTORY_VERSION,
            ws: store.ws,
            samples: store.samples,
        }));
        return true;
    } catch (_) {
        return false;
    }
}

// Percent series per meter key inside the newest TREND_WINDOW_SEC, for the sparkline
export function trendView(store, nowMs = Date.now()) {
    const cutoff = nowMs - TREND_WINDOW_SEC * 1000;
    const view = {};
    for (const key of METER_KEYS) {
        const points = [];
        for (const s of store ? store.samples : []) {
            if (s.t < cutoff) continue;
            const pct = percentOf(s.m, key);
            if (pct !== null) points.push({ t: s.t, pct });
        }
        if (points.length) view[key] = points;
    }
    return view;
}

// Burn-rate estimate for one meter: slope over the newest samples inside the reset window
// Returns null when there is no upward trend or the chronology is too thin
export function paceFor(store, key, resetsSec, nowMs = Date.now()) {
    const points = (trendView(store, nowMs)[key] || []).filter(p => p.t <= nowMs);
    if (points.length < 2 || !(resetsSec > 0)) return null;
    const windowStart = nowMs - Math.min(PACE_WINDOW_SEC, Math.floor(resetsSec)) * 1000;
    const slice = points.filter(p => p.t >= windowStart);
    if (slice.length < 2) return null;
    const first = slice[0];
    const last = slice[slice.length - 1];
    const hours = (last.t - first.t) / 3600000;
    if (hours <= 0) return null;
    const ratePerHour = (last.pct - first.pct) / hours;
    if (!(ratePerHour > 0.01)) return null;
    // Where the meter lands when its window resets, and whether 100% arrives sooner
    const projectedPct = last.pct + ratePerHour * (Math.floor(resetsSec) / 3600);
    const etaSec = ratePerHour > 0 ? Math.max(0, ((100 - last.pct) / ratePerHour) * 3600) : Infinity;
    return { ratePctPerHour: ratePerHour, projectedPct, etaSec };
}

// Pace chips for all three meters; keys without a usable trend resolve to null
export function paceView(store, resetSeconds, nowMs = Date.now()) {
    const reset = resetSeconds || {};
    const view = {};
    for (const key of METER_KEYS) view[key] = paceFor(store, key, reset[key], nowMs);
    return view;
}

// Rebuilds a popup-ready data object from the newest on-disk sample so a shell restart
// can show real figures immediately; flags fromDisk so notifications and LIVE stay honest
export function snapshotData(store) {
    const samples = store ? store.samples : [];
    const last = samples[samples.length - 1];
    if (!last) return null;
    const captured = new Date(last.t);
    const bar = key => {
        const m = last.m[key];
        if (!m || !(m[1] > 0)) return [];
        return [{
            label: METER_LABELS[key],
            value: Api.meterPercent(m[0], m[1]),
            maxValue: 100,
            usedMicroCents: m[0],
            limitMicroCents: m[1],
            usedFormatted: Api.formatCurrency(m[0]),
            limitFormatted: Api.formatCurrency(m[1]),
            remainingFormatted: Api.formatCurrency(Math.max(0, m[1] - m[0])) + ' left',
        }];
    };
    const bars = { hourly: bar('hourly'), weekly: bar('weekly'), monthly: bar('monthly') };
    const headline = bars.weekly.length ? bars.weekly[0].value
        : (bars.monthly.length ? bars.monthly[0].value
        : (bars.hourly.length ? bars.hourly[0].value : 0));
    return {
        isMock: false,
        fromDisk: true,
        planName: 'OpenCode Go Usage Tracker',
        billingPeriod: 'Rolling / Weekly / Monthly',
        usagePercent: headline,
        // Reset countdowns are unknown until the next live poll; the card simply omits them
        resetSeconds: { hourly: 0, weekly: 0, monthly: 0 },
        ...bars,
        lastRefreshed: captured.toLocaleTimeString(),
        capturedAt: last.t,
    };
}
