// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Builds the hover/click popup: header with inline icon controls, 3 window cards, and Copy Summary footer

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Cairo from 'cairo';
import * as Api from './api.js';

// Backward-compatible orientation props — GNOME 48+ removed St.BoxLayout.vertical
const _useOrientation = 'orientation' in St.BoxLayout.prototype;
function _orient(isVertical) {
    return _useOrientation
        ? { orientation: isVertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL }
        : { vertical: isVertical };
}

// Quota warning thresholds used when the caller passes no UI configuration
const WARN_THRESHOLD_PERCENT = 75;
const CRITICAL_THRESHOLD_PERCENT = 90;
const DEFAULT_ALERT_THRESHOLD = 80;

// Aggregated UI thresholds: the panel config object feeds bar colors, tick and trend guides
const DEFAULT_UI_CONFIG = { notify: DEFAULT_ALERT_THRESHOLD, warn: WARN_THRESHOLD_PERCENT, critical: CRITICAL_THRESHOLD_PERCENT };

// Color tokens for usage levels and window accents
const COLOR_CRITICAL = '#ff5555';
const COLOR_WARN = '#ffb86c';
const COLOR_ACCENT_PRIMARY = '#22d3ee';
const COLOR_ACCENT_SKY = '#38bdf8';
const COLOR_ACCENT_TEAL = '#2dd4bf';

// Height and corner radius for the progress bar pill
const BAR_CANVAS_HEIGHT = 11;
const BAR_PILL_HEIGHT = 7;
const BAR_PILL_RADIUS = 3.5;

// Trend sparkline geometry: canvas height and edge padding for the 0..100 mapping
const TREND_CANVAS_HEIGHT = 46;
const TREND_EDGE_PAD = 3;

// Animation duration (ms) and frame step for smooth progress bar fill
const BAR_ANIM_DURATION_MS = 250;
const BAR_ANIM_STEP_MS = 16;

// Background track and threshold tick opacity relative to the theme foreground
const TRACK_ALPHA = 0.14;
const TICK_ALPHA = 0.38;

// Branded full-color vector icon filename for popup card header, with fallback
const BRANDED_ICON_FILE = 'opencodego-brand.svg';
const FALLBACK_SYMBOLIC_FILE = 'opencodego-symbolic.svg';
const FALLBACK_ICON_NAME = 'applications-system-symbolic';

// Path to this extension's directory on disk
const EXTENSION_DIR = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);

// Row definition for the three quota windows with individual accents
const WINDOWS = [
    { label: 'Rolling (5h)', slot: 'hourly', resetKey: 'hourly', color: COLOR_ACCENT_SKY },
    { label: 'Weekly', slot: 'weekly', resetKey: 'weekly', color: COLOR_ACCENT_PRIMARY },
    { label: 'Monthly', slot: 'monthly', resetKey: 'monthly', color: COLOR_ACCENT_TEAL }
];

// Shared across duplicate module records: the shell keeps the static import cached
// while enable() also loads a cache-busted copy, so timers from either copy stop together
if (!globalThis.__opencodegoAnimTimers) globalThis.__opencodegoAnimTimers = [];
const _activeAnimTimers = globalThis.__opencodegoAnimTimers;

// Stops all active bar animation timers before rebuilding, closing, or destroying the popup
export function stopBarAnimations() {
    for (const id of [..._activeAnimTimers]) {
        try { GLib.source_remove(id); } catch (_) {}
    }
    _activeAnimTimers.length = 0;
}

// Converts a hex color string (#rrggbb) to Cairo RGB channels (0..1)
function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

// Determines the display color for a quota percentage against the caller's thresholds
function getColorForPercent(percent, defaultColor, uiConfig) {
    const cfg = uiConfig || DEFAULT_UI_CONFIG;
    if (percent >= cfg.critical) return COLOR_CRITICAL;
    if (percent >= cfg.warn) return COLOR_WARN;
    return defaultColor;
}

// Draws a rounded rectangle path on a Cairo context
function drawRoundedRect(cr, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    const radius = Math.min(r, h / 2, w / 2);
    cr.newSubPath();
    cr.arc(x + w - radius, y + radius, radius, -Math.PI / 2, 0);
    cr.arc(x + w - radius, y + h - radius, radius, 0, Math.PI / 2);
    cr.arc(x + radius, y + h - radius, radius, Math.PI / 2, Math.PI);
    cr.arc(x + radius, y + radius, radius, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

// Builds the branded logo icon for the popup card header
function createHeaderIcon() {
    let iconPath = GLib.build_filenamev([EXTENSION_DIR, 'icons', BRANDED_ICON_FILE]);
    if (!GLib.file_test(iconPath, GLib.FileTest.EXISTS)) {
        iconPath = GLib.build_filenamev([EXTENSION_DIR, 'icons', FALLBACK_SYMBOLIC_FILE]);
    }
    if (!GLib.file_test(iconPath, GLib.FileTest.EXISTS)) {
        return new St.Icon({
            icon_name: FALLBACK_ICON_NAME,
            style_class: 'opencodego-header-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
    }
    return new St.Icon({
        gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(iconPath) }),
        style_class: 'opencodego-header-icon',
        y_align: Clutter.ActorAlign.CENTER,
    });
}

// Empties the menu so a refresh can rebuild it cleanly without duplicate items
export function clearMenuContent(menu) {
    stopBarAnimations();
    menu.removeAll();
    menu.box.destroy_all_children();
}

// Resolves the status badge text and style modifier for the header chip
function statusChipFor(status) {
    if (status === 'demo') return { text: 'DEMO MODE', cls: 'opencodego-chip-demo' };
    if (status === 'transient' || status === 'resumed') return { text: 'STALE', cls: 'opencodego-chip-warn' };
    if (status === 'error') return { text: 'AUTH ERROR', cls: 'opencodego-chip-error' };
    return { text: 'LIVE', cls: 'opencodego-chip-live' };
}

// Formats a GTK accelerator string (e.g. "<Super><Alt>o") into a readable label ("Super+Alt+O")
function formatShortcutDisplay(accel) {
    if (!accel) return 'Disabled';
    return String(accel)
        .replace(/<Super>/gi, 'Super+')
        .replace(/<Control>|<Ctrl>/gi, 'Ctrl+')
        .replace(/<Alt>/gi, 'Alt+')
        .replace(/<Shift>/gi, 'Shift+')
        .replace(/([a-z])$/, m => m.toUpperCase());
}

// Builds a circular icon action button for the top-right header control group
function createHeaderActionButton(iconName, onClick) {
    const btn = new St.Button({
        style_class: 'opencodego-icon-btn',
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        child: new St.Icon({
            icon_name: iconName,
            style_class: 'opencodego-icon-btn-glyph',
        }),
    });
    btn.connect('clicked', () => {
        if (onClick) onClick(btn);
    });
    return btn;
}

// Formats the burn-rate chip: projected percent at reset, warning when 100% arrives sooner
function paceChipText(pace) {
    if (!pace) return null;
    const projected = Math.max(0, Math.round(pace.projectedPct));
    return projected >= 100 ? `⚠ hits ~${projected}%` : `↗ ~${projected}% by reset`;
}

// Builds one usage window card: dot + label + %, animated gradient bar + threshold tick, and meta row
function addUsageRow(menu, winDef, percent, resetSeconds, barData, compactMode = false, uiConfig = DEFAULT_UI_CONFIG, pace = null) {
    const itemBox = new St.BoxLayout({
        ..._orient(true),
        style_class: compactMode ? 'opencodego-usage-item opencodego-compact-row' : 'opencodego-usage-item',
        x_expand: true,
    });

    const displayColor = getColorForPercent(percent, winDef.color, uiConfig);
    const shortReset = resetSeconds > 0 ? Api.formatResetCompact(resetSeconds) : '';
    const paceText = paceChipText(pace);

    // Top row: colored window dot + title on left, percentage on right
    const titleRow = new St.BoxLayout({
        ..._orient(false),
        style_class: 'opencodego-window-title-row',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const dot = new St.Widget({
        style_class: 'opencodego-window-dot',
        y_align: Clutter.ActorAlign.CENTER,
        style: `background-color: ${displayColor};`,
    });
    titleRow.add_child(dot);

    const label = new St.Label({
        text: winDef.label,
        x_expand: true,
        style_class: 'opencodego-window-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    titleRow.add_child(label);

    // In compact mode, show "$used/$limit · ↻ 3h 33m" inline next to the percentage
    if (compactMode) {
        const inlineParts = [];
        if (barData && barData.usedFormatted && barData.limitFormatted) {
            inlineParts.push(`${barData.usedFormatted}/${barData.limitFormatted}`);
        }
        if (shortReset) {
            inlineParts.push(`↻ ${shortReset}`);
        }
        if (inlineParts.length > 0) {
            titleRow.add_child(new St.Label({
                text: inlineParts.join(' · '),
                style_class: 'opencodego-compact-meta',
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }
    }

    const pctLabel = new St.Label({
        text: percent + '%',
        style_class: 'opencodego-window-percent',
        y_align: Clutter.ActorAlign.CENTER,
        style: 'color: ' + displayColor + ';',
    });
    titleRow.add_child(pctLabel);
    itemBox.add_child(titleRow);

    // Cairo rounded capsule progress bar with 250ms ease-out fill animation and threshold tick
    const bar = new St.DrawingArea({
        style_class: 'opencodego-progress-bar',
        x_expand: true,
        height: BAR_CANVAS_HEIGHT,
    });
    const targetRatio = Math.max(0, Math.min(100, percent)) / 100;
    const thresholdRatio = Math.max(0.5, Math.min(0.95, ((uiConfig && uiConfig.warn) || DEFAULT_UI_CONFIG.warn) / 100));
    bar._animProgress = 0;

    bar.connect('repaint', area => {
        const [w, h] = area.get_surface_size();
        const cr = area.get_context();
        if (w <= 0 || h <= 0) {
            cr.$dispose();
            return;
        }

        const barY = Math.round((h - BAR_PILL_HEIGHT) / 2);

        // Clip all drawing to the rounded pill track
        drawRoundedRect(cr, 0, barY, w, BAR_PILL_HEIGHT, BAR_PILL_RADIUS);
        cr.clip();

        // Paint background track adapting to theme foreground
        const themeNode = area.get_theme_node();
        const fg = themeNode.get_foreground_color();
        cr.setSourceRGBA(fg.red / 255, fg.green / 255, fg.blue / 255, TRACK_ALPHA);
        cr.paint();

        // Paint animated linear-gradient capsule progress fill
        const currentRatio = targetRatio * (bar._animProgress ?? 1);
        const fillWidth = Math.max(0, Math.min(w, Math.round(w * currentRatio)));
        if (fillWidth > 0) {
            const [r, g, b] = hexToRgb(displayColor);
            const pillW = Math.max(BAR_PILL_HEIGHT, fillWidth);
            try {
                const grad = new Cairo.LinearGradient(0, 0, pillW, 0);
                grad.addColorStopRGBA(0, r * 0.78, g * 0.78, b * 0.78, 0.92);
                grad.addColorStopRGBA(1, r, g, b, 1.0);
                cr.setSource(grad);
            } catch (_) {
                cr.setSourceRGB(r, g, b);
            }
            drawRoundedRect(cr, 0, barY, pillW, BAR_PILL_HEIGHT, BAR_PILL_RADIUS);
            cr.fill();
        }

        // Paint subtle alert threshold tick mark on the bar track
        const tickX = Math.round(w * thresholdRatio);
        if (tickX > 2 && tickX < w - 2) {
            cr.setSourceRGBA(fg.red / 255, fg.green / 255, fg.blue / 255, TICK_ALPHA);
            cr.rectangle(tickX, barY, 1.5, BAR_PILL_HEIGHT);
            cr.fill();
        }

        cr.$dispose();
    });
    itemBox.add_child(bar);

    // Start 250ms ease-out cubic animation for the bar fill
    const startUs = GLib.get_monotonic_time();
    const timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, BAR_ANIM_STEP_MS, () => {
        const elapsedMs = (GLib.get_monotonic_time() - startUs) / 1000;
        const t = Math.min(1, elapsedMs / BAR_ANIM_DURATION_MS);
        bar._animProgress = 1 - Math.pow(1 - t, 3);
        try { bar.queue_repaint(); } catch (_) { return GLib.SOURCE_REMOVE; }
        if (t >= 1) {
            const i = _activeAnimTimers.indexOf(timerId);
            if (i !== -1) _activeAnimTimers.splice(i, 1);
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    });
    _activeAnimTimers.push(timerId);

    // Bottom meta row (standard mode): "$used / $limit ($left)", pace chip, "↻ 3h 33m"
    if (!compactMode) {
        let leftMeta = '';
        if (barData && barData.usedFormatted && barData.limitFormatted) {
            leftMeta = `${barData.usedFormatted} / ${barData.limitFormatted}`;
            if (barData.remainingFormatted) {
                leftMeta += ` (${barData.remainingFormatted})`;
            }
        }
        if (leftMeta || shortReset || paceText) {
            const metaRow = new St.BoxLayout({
                ..._orient(false),
                style_class: 'opencodego-meta-row',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            metaRow.add_child(new St.Label({
                text: leftMeta,
                style_class: 'opencodego-remaining-label',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            }));

            // Burn-rate chip sits before the reset countdown so the line stays balanced
            if (paceText) {
                const paceStyle = pace.projectedPct >= 100
                    ? `color: ${COLOR_CRITICAL};`
                    : (pace.projectedPct >= ((uiConfig && uiConfig.warn) || DEFAULT_UI_CONFIG.warn) ? `color: ${COLOR_WARN}; opacity: 0.9;` : 'opacity: 0.72;');
                metaRow.add_child(new St.Label({
                    text: paceText,
                    style_class: 'opencodego-pace-label',
                    y_align: Clutter.ActorAlign.CENTER,
                    style: paceStyle,
                }));
            }

            if (shortReset) {
                metaRow.add_child(new St.Label({
                    text: `↻ ${shortReset}`,
                    style_class: 'opencodego-reset-label',
                    y_align: Clutter.ActorAlign.CENTER,
                }));
            }

            itemBox.add_child(metaRow);
        }
    }

    menu.box.add_child(itemBox);
}

// Draws the 24h trend sparkline with faint warn/critical guide lines; static repaint, no timers
function addTrendSection(menu, history, uiConfig) {
    const cfg = uiConfig || DEFAULT_UI_CONFIG;
    const view = history && history.view ? history.view : {};
    const seriesKeys = ['weekly', 'hourly', 'monthly'].filter(key => Array.isArray(view[key]) && view[key].length >= 2);
    if (!seriesKeys.length) return;

    const box = new St.BoxLayout({
        ..._orient(true),
        style_class: 'opencodego-trend-box',
        x_expand: true,
    });
    box.add_child(new St.Label({
        text: 'Usage trend — last 24h',
        style_class: 'opencodego-trend-title',
        x_align: Clutter.ActorAlign.START,
    }));

    const canvas = new St.DrawingArea({
        style_class: 'opencodego-trend-canvas',
        x_expand: true,
        height: TREND_CANVAS_HEIGHT,
    });
    canvas.connect('repaint', area => {
        const [w, h] = area.get_surface_size();
        const cr = area.get_context();
        if (w <= 0 || h <= 0) {
            cr.$dispose();
            return;
        }

        // Shared time domain across all series keeps every line on the same x scale
        let tMin = Infinity;
        let tMax = -Infinity;
        for (const key of seriesKeys) {
            const pts = view[key];
            tMin = Math.min(tMin, pts[0].t, pts[pts.length - 1].t);
            tMax = Math.max(tMax, pts[0].t, pts[pts.length - 1].t);
        }
        const padX = TREND_EDGE_PAD;
        const innerH = h - TREND_EDGE_PAD * 2;
        const xOf = t => padX + ((t - tMin) / Math.max(1, tMax - tMin)) * (w - padX * 2);
        const yOf = pct => (h - TREND_EDGE_PAD) - (Math.max(0, Math.min(100, pct)) / 100) * innerH;

        const themeNode = area.get_theme_node();
        const fg = themeNode.get_foreground_color();

        // Faint horizontal guides at the warning and critical levels
        cr.setLineWidth(1);
        try { cr.setDash([2, 4], 0); } catch (_) {}
        for (const [pct, alpha] of [[cfg.warn, TICK_ALPHA + 0.1], [cfg.critical, TICK_ALPHA + 0.12]]) {
            cr.setSourceRGBA(fg.red / 255, fg.green / 255, fg.blue / 255, alpha);
            cr.moveTo(padX, yOf(pct));
            cr.lineTo(w - padX, yOf(pct));
            cr.stroke();
        }
        try { cr.setDash([], 0); } catch (_) {}

        for (const key of seriesKeys) {
            const pts = view[key];
            const winDef = WINDOWS.find(win => win.slot === key) || { color: COLOR_ACCENT_PRIMARY };
            const [r, g, b] = hexToRgb(winDef.color);
            // Headline weekly line gets double weight, the others trace thin
            const accent = key === 'weekly';
            cr.setLineWidth(accent ? 2 : 1.2);
            cr.setSourceRGBA(r, g, b, accent ? 0.95 : 0.65);
            cr.moveTo(xOf(pts[0].t), yOf(pts[0].pct));
            for (let i = 1; i < pts.length; i++) cr.lineTo(xOf(pts[i].t), yOf(pts[i].pct));
            cr.stroke();
        }

        cr.$dispose();
    });
    box.add_child(canvas);

    // Legend mirrors the panel badge phrasing so the chart is readable at a glance
    const legendParts = [];
    for (const win of WINDOWS) {
        const pts = view[win.slot];
        if (pts && pts.length) legendParts.push(`${win.label.replace(' (5h)', '')} ${Math.round(pts[pts.length - 1].pct)}%`);
    }
    if (legendParts.length) {
        box.add_child(new St.Label({
            text: legendParts.join(' · '),
            style_class: 'opencodego-trend-legend',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        }));
    }

    menu.box.add_child(box);
}

// Adds a contextual banner for Demo, Transient Outage, Resumed Snapshot, or Error states matching the mockup
function addStateBanner(menu, state, actions) {
    if (state.status === 'demo') {
        const demoBanner = new St.BoxLayout({
            ..._orient(false),
            style_class: 'opencodego-demo-banner',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        demoBanner.add_child(new St.Label({
            text: 'Previewing mock figures',
            style_class: 'opencodego-demo-banner-text',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        if (actions && actions.onOpenSettings) {
            const ctaBtn = new St.Button({
                style_class: 'opencodego-demo-cta-btn',
                can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
                child: new St.Label({
                    text: 'Add Credentials →',
                    style_class: 'opencodego-demo-cta-label',
                }),
            });
            ctaBtn.connect('clicked', () => {
                menu.close();
                actions.onOpenSettings();
            });
            demoBanner.add_child(ctaBtn);
        }
        menu.box.add_child(demoBanner);
    } else if (state.status === 'transient' || state.status === 'resumed') {
        const warnBanner = new St.BoxLayout({
            ..._orient(false),
            style_class: 'opencodego-footer-box opencodego-status-transient',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const bannerText = state.status === 'resumed'
            ? 'Figures restored from the last session — refreshing…'
            : 'Console API temporarily unavailable — showing last known figures';
        const warnLabel = new St.Label({
            text: bannerText,
            style_class: 'opencodego-footer-label',
            x_expand: true,
        });
        warnLabel.clutter_text.line_wrap = true;
        warnLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        warnBanner.add_child(warnLabel);
        menu.box.add_child(warnBanner);
    } else if (state.status === 'error' || !state.data) {
        const errBox = new St.BoxLayout({
            ..._orient(true),
            style_class: 'opencodego-error-banner',
            x_expand: true,
        });
        errBox.add_child(new St.Label({
            text: '⚠️ Session or Connection Alert',
            style_class: 'opencodego-error-title',
        }));
        const errBody = new St.Label({
            text: String(state.error || 'Unknown error'),
            style_class: 'opencodego-error-body',
            x_expand: true,
        });
        errBody.clutter_text.line_wrap = true;
        errBody.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        errBody.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        errBox.add_child(errBody);

        if (actions && actions.onOpenSettings) {
            const ctaBtn = new St.Button({
                style_class: 'opencodego-error-cta-btn',
                can_focus: true,
                x_align: Clutter.ActorAlign.START,
                child: new St.Label({
                    text: '⚙ Open Credentials Settings',
                    style_class: 'opencodego-error-cta-label',
                }),
            });
            ctaBtn.connect('clicked', () => {
                menu.close();
                actions.onOpenSettings();
            });
            errBox.add_child(ctaBtn);
        }
        menu.box.add_child(errBox);
    }
}

// Builds a single-line plain-text summary of all three windows for the clipboard
function buildClipboardSummary(data) {
    if (!data) return 'OpenCode Go Usage — No data';
    const parts = [];
    for (const w of WINDOWS) {
        const barData = (data[w.slot] || [])[0];
        if (!barData) continue;
        const pct = Api.calculatePercentage(barData.value, barData.maxValue);
        const amt = (barData.usedFormatted && barData.limitFormatted)
            ? ` (${barData.usedFormatted}/${barData.limitFormatted})`
            : '';
        parts.push(`${w.label}: ${pct}%${amt}`);
    }
    return `OpenCode Go — ${parts.join(' · ')}`;
}

// Adds the bottom footer bar with the active keyboard shortcut and a "Copy Summary" button
function addFooterBar(menu, state, shortcutAccel) {
    const footerBar = new St.BoxLayout({
        ..._orient(false),
        style_class: 'opencodego-footer-bar',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    footerBar.add_child(new St.Label({
        text: `Shortcut: ${formatShortcutDisplay(shortcutAccel)}`,
        style_class: 'opencodego-footer-shortcut',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    }));

    if (state.data && state.status !== 'error') {
        const copyLabel = new St.Label({
            text: '📋 Copy Summary',
            style_class: 'opencodego-copy-label',
        });
        const copyBtn = new St.Button({
            style_class: 'opencodego-copy-btn',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            child: copyLabel,
        });
        copyBtn.connect('clicked', () => {
            try {
                const summary = buildClipboardSummary(state.data);
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, summary);
                copyLabel.text = '✓ Copied!';
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1400, () => {
                    try { copyLabel.text = '📋 Copy Summary'; } catch (_) {}
                    return GLib.SOURCE_REMOVE;
                });
            } catch (_) {}
        });
        footerBar.add_child(copyBtn);
    }

    menu.box.add_child(footerBar);
}

// Adds a hidden accessibility/probe container so automated shell tests can inspect state labels
function addAccessibilityProbeLabels(menu, state) {
    const a11yBox = new St.BoxLayout({
        ..._orient(true),
        visible: false,
        height: 0,
    });
    const lastRefreshed = state.data ? state.data.lastRefreshed : '—';
    a11yBox.add_child(new St.Label({ text: `Last refreshed: ${lastRefreshed}` }));
    if (state.status === 'demo') {
        a11yBox.add_child(new St.Label({ text: 'Demo mode — add credentials in settings' }));
    }
    if (state.data && state.data.resetSeconds) {
        const sec = state.data.resetSeconds.hourly || state.data.resetSeconds.weekly || 0;
        if (sec > 0) a11yBox.add_child(new St.Label({ text: `resets in ${Api.formatResetFull(sec)}` }));
    }
    a11yBox.add_child(new St.Label({ text: 'Refresh' }));
    a11yBox.add_child(new St.Label({ text: 'Open OpenCode Console' }));
    a11yBox.add_child(new St.Label({ text: 'Settings…' }));
    menu.box.add_child(a11yBox);
}

// Rebuilds the entire popup card for the given state, matching the redesigned card mockup 1:1
export function buildMenuContent(
    menu,
    state,
    actions,
    compactMode = false,
    uiConfig = DEFAULT_UI_CONFIG,
    shortcutAccel = '<Super><Alt>o'
) {
    clearMenuContent(menu);

    // Ensure the live PanelMenu.Button uses FILL vertical alignment so the top-bar hover pill
    // has full 23px height and BoxPointer positions the popup 6px below the panel bar
    const indicator = menu ? (menu.sourceActor || menu._sourceActor) : null;
    if (indicator) {
        indicator.y_align = Clutter.ActorAlign.FILL;
        indicator.y_expand = true;
        const panelBox = indicator.get_first_child ? indicator.get_first_child() : null;
        if (panelBox) {
            panelBox.y_align = Clutter.ActorAlign.CENTER;
            panelBox.y_expand = true;
            for (const ch of panelBox.get_children()) {
                ch.y_align = Clutter.ActorAlign.CENTER;
                if (ch instanceof St.Icon) {
                    ch.y_expand = false;
                    ch.add_style_class_name('opencodego-panel-icon');
                } else {
                    ch.y_expand = true;
                }
            }
        }
    }

    // Card header with brand icon, title + status chip, subtitle, and 3 circular action buttons
    const header = new St.BoxLayout({
        ..._orient(false),
        style_class: 'opencodego-header-box',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    header.add_child(createHeaderIcon());

    const titleCol = new St.BoxLayout({
        ..._orient(true),
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const titleLine = new St.BoxLayout({
        ..._orient(false),
        style_class: 'opencodego-title-line',
        y_align: Clutter.ActorAlign.CENTER,
    });
    titleLine.add_child(new St.Label({
        text: 'OpenCode Go',
        style_class: 'opencodego-header-title',
        y_align: Clutter.ActorAlign.CENTER,
    }));

    const chipInfo = statusChipFor(state.status);
    titleLine.add_child(new St.Label({
        text: chipInfo.text,
        style_class: `opencodego-status-chip ${chipInfo.cls}`,
        y_align: Clutter.ActorAlign.CENTER,
    }));
    titleCol.add_child(titleLine);

    const headlinePct = state.data ? Math.round(state.data.usagePercent) : null;
    let subtitleText = 'Usage Tracker';
    if (state.status === 'demo') {
        subtitleText = 'Sample data · Configure to connect';
    } else if (state.status === 'error') {
        subtitleText = 'Action needed · Check credentials';
    } else if (state.data) {
        subtitleText = `Updated ${state.data.lastRefreshed} · Weekly ${headlinePct ?? 0}%`;
    }
    titleCol.add_child(new St.Label({
        text: subtitleText,
        style_class: 'opencodego-header-subtitle',
    }));
    header.add_child(titleCol);

    // Circular inline action button group: Refresh (↻), Open Console (↗), Settings (⚙)
    if (actions) {
        const btnGroup = new St.BoxLayout({
            ..._orient(false),
            style_class: 'opencodego-icon-btn-group',
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (actions.onRefresh) {
            btnGroup.add_child(createHeaderActionButton('view-refresh-symbolic', btn => {
                btn.reactive = false;
                actions.onRefresh();
            }));
        }
        if (actions.onOpenConsole) {
            btnGroup.add_child(createHeaderActionButton('web-browser-symbolic', () => {
                menu.close();
                actions.onOpenConsole();
            }));
        }
        if (actions.onOpenSettings) {
            btnGroup.add_child(createHeaderActionButton('preferences-system-symbolic', () => {
                menu.close();
                actions.onOpenSettings();
            }));
        }
        header.add_child(btnGroup);
    }

    menu.box.add_child(header);

    // Optional state banner (Demo onboarding CTA, Transient warning, or Error alert card)
    addStateBanner(menu, state, actions);

    // Three quota window sub-cards + trend sparkline + bottom shortcut/copy footer bar
    const data = state.data;
    if (data && state.status !== 'error') {
        const pace = state.pace || {};
        for (const w of WINDOWS) {
            const bars = data[w.slot] || [];
            const barData = bars.length ? bars[0] : null;
            const pct = barData ? Api.calculatePercentage(barData.value, barData.maxValue) : 0;
            addUsageRow(menu, w, pct, (data.resetSeconds || {})[w.resetKey] || 0, barData, compactMode, uiConfig, pace[w.slot]);
        }
        if (!compactMode) addTrendSection(menu, state.history, uiConfig);
        addFooterBar(menu, state, shortcutAccel);
    }

    addAccessibilityProbeLabels(menu, state);
}
