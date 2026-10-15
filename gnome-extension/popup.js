// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Builds the hover/click popup: branded header, three usage windows, footer status note

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Api from './api.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Backward-compatible orientation props — GNOME 48+ removed St.BoxLayout.vertical
const _useOrientation = 'orientation' in St.BoxLayout.prototype;
function _orient(isVertical) {
    return _useOrientation
        ? { orientation: isVertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL }
        : { vertical: isVertical };
}

// Quota warning thresholds matching the KDE plasmoid and panel indicator
const WARN_THRESHOLD_PERCENT = 75;
const CRITICAL_THRESHOLD_PERCENT = 90;

// Color tokens for usage levels and window accents
const COLOR_CRITICAL = '#ff5555';
const COLOR_WARN = '#ffb86c';
const COLOR_ACCENT_PRIMARY = '#22d3ee';
const COLOR_ACCENT_SKY = '#38bdf8';
const COLOR_ACCENT_TEAL = '#2dd4bf';

// Height and corner radius for the progress bar pill
const BAR_CANVAS_HEIGHT = 10;
const BAR_PILL_HEIGHT = 6;
const BAR_PILL_RADIUS = 3;

// Background track opacity relative to the theme foreground
const TRACK_ALPHA = 0.15;

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

// Converts a hex color string (#rrggbb) to Cairo RGB channels (0..1)
function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

// Determines the display color for a quota percentage
function getColorForPercent(percent, defaultColor) {
    if (percent >= CRITICAL_THRESHOLD_PERCENT) return COLOR_CRITICAL;
    if (percent >= WARN_THRESHOLD_PERCENT) return COLOR_WARN;
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
    menu.removeAll();
    menu.box.destroy_all_children();
}

// Formats a seconds countdown for the quota window reset note
function resetLabel(seconds) {
    return Api.formatResetFull(seconds);
}

// Builds one usage window row: icon, label, limit figures, percent, rounded progress bar, and reset countdown
function addUsageRow(menu, winDef, percent, resetSeconds, barData, compactMode = false) {
    const itemBox = new St.BoxLayout({
        ..._orient(true),
        style_class: compactMode ? 'opencodego-usage-item opencodego-compact-row' : 'opencodego-usage-item',
        x_expand: true,
    });

    // Title line holding window label, limit numbers, and percentage
    const titleRow = new St.BoxLayout({
        ..._orient(false),
        style_class: 'opencodego-window-title-row',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const label = new St.Label({
        text: winDef.label,
        x_expand: true,
        style_class: 'opencodego-window-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    titleRow.add_child(label);

    // Limit numbers (e.g. $4.80 / $20.00)
    if (barData && barData.usedFormatted && barData.limitFormatted) {
        const limitLabel = new St.Label({
            text: `${barData.usedFormatted} / ${barData.limitFormatted}`,
            style_class: 'opencodego-window-limit',
            y_align: Clutter.ActorAlign.CENTER,
        });
        titleRow.add_child(limitLabel);
    }

    const displayColor = getColorForPercent(percent, winDef.color);
    const pctLabel = new St.Label({
        text: percent + '%',
        style_class: 'opencodego-window-percent',
        y_align: Clutter.ActorAlign.CENTER,
        style: 'color: ' + displayColor + ';',
    });
    titleRow.add_child(pctLabel);
    itemBox.add_child(titleRow);

    // Cairo rounded pill progress bar with clipped track and colored fill
    const bar = new St.DrawingArea({
        style_class: 'opencodego-progress-bar',
        x_expand: true,
        height: BAR_CANVAS_HEIGHT,
    });
    const fillRatio = Math.max(0, Math.min(100, percent)) / 100;
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

        // Paint progress fill rectangle
        const fillWidth = Math.max(0, Math.min(w, Math.round(w * fillRatio)));
        if (fillWidth > 0) {
            const [r, g, b] = hexToRgb(displayColor);
            cr.setSourceRGB(r, g, b);
            cr.rectangle(0, barY, fillWidth, BAR_PILL_HEIGHT);
            cr.fill();
        }

        cr.$dispose();
    });
    itemBox.add_child(bar);

    // Optional countdown to quota reset (hidden in compact mode)
    if (!compactMode && resetSeconds > 0) {
        const resetSub = new St.Label({
            text: 'resets in ' + resetLabel(resetSeconds),
            style_class: 'opencodego-reset-label',
        });
        itemBox.add_child(resetSub);
    }

    menu.box.add_child(itemBox);
}

// One-line footer carrying the current fetch status or error
function addFooter(menu, state) {
    let text = 'Last refreshed: ' + (state.data ? state.data.lastRefreshed : '—');
    if (state.status === 'demo') text = 'Demo mode — add credentials in settings';
    else if (state.status === 'transient') text = 'Console API temporarily unavailable — showing last known figures';
    else if (state.status === 'error') text = String(state.error || 'Unknown error');
    const footer = new St.Label({ text: text, style_class: 'opencodego-footer-label' });
    menu.box.add_child(footer);
}

// Trailing action menu items with symbolic icons
function addActions(menu, actions) {
    if (!actions) return;
    const run = cb => () => { menu.close(); cb(); };
    if (actions.onRefresh) {
        const refreshItem = new PopupMenu.PopupImageMenuItem('Refresh', 'view-refresh-symbolic');
        refreshItem.connect('activate', () => {
            refreshItem.label.text = 'Refreshing…';
            refreshItem.setSensitive(false);
            actions.onRefresh();
        });
        menu.addMenuItem(refreshItem);
    }
    if (actions.onOpenConsole) {
        const consoleItem = new PopupMenu.PopupImageMenuItem('Open OpenCode Console', 'web-browser-symbolic');
        consoleItem.connect('activate', run(actions.onOpenConsole));
        menu.addMenuItem(consoleItem);
    }
    if (actions.onOpenSettings) {
        const settingsItem = new PopupMenu.PopupImageMenuItem('Settings…', 'preferences-system-symbolic');
        settingsItem.connect('activate', run(actions.onOpenSettings));
        menu.addMenuItem(settingsItem);
    }
}

// Rebuilds the entire popup card for the given state
export function buildMenuContent(menu, state, actions, compactMode = false) {
    clearMenuContent(menu);

    // Card header with brand icon, title, subtitle, and headline usage badge
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
    titleCol.add_child(new St.Label({
        text: 'OpenCode Go',
        style_class: 'opencodego-header-title',
    }));
    titleCol.add_child(new St.Label({
        text: 'Usage Tracker',
        style_class: 'opencodego-header-subtitle',
    }));
    header.add_child(titleCol);

    const headlinePct = state.data ? Math.round(state.data.usagePercent) : null;
    const badgeText = headlinePct !== null ? headlinePct + '%' : '—';
    const badgeColor = headlinePct !== null ? getColorForPercent(headlinePct, COLOR_ACCENT_PRIMARY) : null;
    const badge = new St.Label({
        text: badgeText,
        style_class: 'opencodego-header-badge',
        y_align: Clutter.ActorAlign.CENTER,
        style: badgeColor ? 'color: ' + badgeColor + ';' : '',
    });
    header.add_child(badge);
    menu.box.add_child(header);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Window items or error state
    const data = state.data;
    if (!data || state.status === 'error') {
        addFooter(menu, state);
    } else {
        for (const w of WINDOWS) {
            const bars = data[w.slot] || [];
            const barData = bars.length ? bars[0] : null;
            const pct = barData ? Api.calculatePercentage(barData.value, barData.maxValue) : 0;
            addUsageRow(menu, w, pct, (data.resetSeconds || {})[w.resetKey] || 0, barData, compactMode);
        }
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        addFooter(menu, state);
    }

    addActions(menu, actions);
}
