// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// gsettings access helpers, shared by the shell runtime and the prefs window

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Schema id must match metadata.json's settings-schema and the gschema.xml id
const SCHEMA_ID = 'org.gnome.shell.extensions.opencodego-usage';

// gsettings keys, kept in one place so runtime and prefs never drift
const KEY_WORKSPACE = 'workspace-id';
const KEY_COOKIE = 'auth-cookie';
const KEY_REFRESH = 'refresh-minutes';
const KEY_PANEL_BADGE = 'show-panel-badge';
const KEY_WARN_PERCENT = 'warn-percent';
const KEY_CRITICAL_PERCENT = 'critical-percent';
const KEY_HISTORY = 'enable-history';
const KEY_TRAY_MODE = 'tray-display-mode';
const KEY_NOTIFICATIONS = 'enable-notifications';
const KEY_THRESHOLD = 'notification-threshold';
const KEY_COMPACT_MODE = 'compact-mode';
const KEY_TOGGLE_SHORTCUT = 'toggle-shortcut';
const KEY_HOVER_OPEN = 'hover-to-open';

// Seconds per minute used to convert the refresh setting
const SECONDS_PER_MINUTE = 60;

// Directory holding this module, derived from its own file:// URL so the schema
// is found whether we run inside the shell, inside prefs.js, or from a test
const EXTENSION_DIR = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);

// Resolves the extension's own schemas/ directory against the default schema
// source, then falls back to the default source for system-wide installs
function schemaSourceForExtension() {
    const schemaDir = GLib.build_filenamev([EXTENSION_DIR, 'schemas']);
    const defaultSource = Gio.SettingsSchemaSource.get_default();
    if (GLib.file_test(schemaDir, GLib.FileTest.EXISTS))
        return Gio.SettingsSchemaSource.new_from_directory(schemaDir, defaultSource, false);
    return defaultSource;
}

// Loads the compiled schema; throws a readable error if the install is broken
export function getSettings() {
    const schema = schemaSourceForExtension().lookup(SCHEMA_ID, true);
    if (!schema)
        throw new Error(`Schema ${SCHEMA_ID} not found — reinstall the extension`);
    return new Gio.Settings({ settings_schema: schema });
}

// Workspace id accessor
export function getWorkspaceId(settings) { return settings.get_string(KEY_WORKSPACE); }
// Auth cookie accessor
export function getAuthCookie(settings) { return settings.get_string(KEY_COOKIE); }
// Refresh interval in seconds (minutes * 60) with a one-minute floor
export function getRefreshSeconds(settings) {
    return Math.max(1, settings.get_uint(KEY_REFRESH)) * SECONDS_PER_MINUTE;
}
// Whether the panel shows the headline percentage next to the icon
export function getShowPanelBadge(settings) { return settings.get_boolean(KEY_PANEL_BADGE); }
// Percentage where bars and the badge turn amber
export function getWarnPercent(settings) { return settings.get_uint(KEY_WARN_PERCENT); }
// Percentage where bars and the badge turn red
export function getCriticalPercent(settings) { return settings.get_uint(KEY_CRITICAL_PERCENT); }
// Whether local usage history (sparkline, pace, resume snapshot) is collected
export function getHistoryEnabled(settings) { return settings.get_boolean(KEY_HISTORY); }
// Which quota window to display in the panel (weekly, fiveHour, monthly, all, none)
export function getTrayDisplayMode(settings) { return settings.get_string(KEY_TRAY_MODE) || 'weekly'; }
// Whether desktop notifications are enabled
export function getEnableNotifications(settings) { return settings.get_boolean(KEY_NOTIFICATIONS); }
// Usage percentage threshold triggering a notification
export function getNotificationThreshold(settings) { return settings.get_uint(KEY_THRESHOLD); }
// Whether compact view is enabled in the popup
export function getCompactMode(settings) { return settings.get_boolean(KEY_COMPACT_MODE); }
// Keyboard shortcut array to toggle popup menu
export function getToggleShortcut(settings) { return settings.get_strv(KEY_TOGGLE_SHORTCUT); }
// Whether hovering over the panel indicator opens the popup
export function getHoverToOpen(settings) { return settings.get_boolean(KEY_HOVER_OPEN); }

// Subscribes to key changes; cb receives the changed key name
export function connectChanged(settings, names, cb) {
    const ids = names.map(n => settings.connect(`changed::${n}`, (s, k) => cb(k)));
    return () => ids.forEach(id => settings.disconnect(id));
}

// Key list watched by the runtime so a settings edit refreshes immediately
export const WATCHED_KEYS = [
    KEY_WORKSPACE,
    KEY_COOKIE,
    KEY_REFRESH,
    KEY_PANEL_BADGE,
    KEY_WARN_PERCENT,
    KEY_CRITICAL_PERCENT,
    KEY_HISTORY,
    KEY_TRAY_MODE,
    KEY_NOTIFICATIONS,
    KEY_THRESHOLD,
    KEY_COMPACT_MODE,
    KEY_TOGGLE_SHORTCUT,
    KEY_HOVER_OPEN
];
export { KEY_WORKSPACE, KEY_COOKIE, KEY_REFRESH, KEY_PANEL_BADGE, KEY_WARN_PERCENT, KEY_CRITICAL_PERCENT, KEY_HISTORY, KEY_TRAY_MODE, KEY_NOTIFICATIONS, KEY_THRESHOLD, KEY_COMPACT_MODE, KEY_TOGGLE_SHORTCUT, KEY_HOVER_OPEN };
