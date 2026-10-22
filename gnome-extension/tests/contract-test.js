// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Contract tests for the settings resolver, the prefs entry point, and metadata.
// These pin the two GNOME 50 breakages found in live testing:
//   1. new Gio.Settings({schema_id}) cannot see an extension's own schemas/ dir
//   2. prefs.js must expose fillPreferencesWindow(), not an Adw.PreferencesWindow subclass

import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import * as Settings from '../settings.js';
import Prefs from '../prefs.js';

// Minimal assert helpers so gjs runs without any dependency
let failures = 0;
function ok(cond, msg) {
    if (!cond) { console.error('FAIL: ' + msg); failures++; }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

const EXTENSION_DIR = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));

// --- metadata.json must agree with the schema id and the extension uuid ---
const [, metaBytes] = GLib.file_get_contents(`${EXTENSION_DIR}/metadata.json`);
const meta = JSON.parse(new TextDecoder().decode(metaBytes));
eq(meta.uuid, 'opencodego-usage@mayanktaker.com', 'metadata uuid uses a name@namespace form');
// EGO review rule EGO-M-005: session-modes must be omitted when it only declares `user`
ok(!('session-modes' in meta), 'session-modes is omitted for the default user mode');
eq(meta['settings-schema'], 'org.gnome.shell.extensions.opencodego-usage', 'metadata declares the schema');
// Every key the runtime reads must exist in the schema, or enable() throws
const [, schemaBytes] = GLib.file_get_contents(`${EXTENSION_DIR}/schemas/org.gnome.shell.extensions.opencodego-usage.gschema.xml`);
const schemaXml = new TextDecoder().decode(schemaBytes);
for (const key of Settings.WATCHED_KEYS)
    ok(schemaXml.includes(`name="${key}"`), `schema declares the ${key} key`);

// --- settings.js resolves the extension's own compiled schema ---
let settings = null;
try {
    settings = Settings.getSettings();
} catch (e) {
    ok(false, `getSettings() threw: ${e.message}`);
}
if (settings) {
    // Fresh schema defaults prove the schema resolved rather than a stale dconf value leaking in
    ok(typeof settings.get_string('workspace-id') === 'string', 'workspace-id reads as a string');
    ok(settings.get_uint('refresh-minutes') >= 1, 'refresh-minutes has a one-minute floor');
    eq(Settings.getRefreshSeconds({ get_uint: () => 5 }), 300, 'five minutes is 300 seconds');
    eq(Settings.getRefreshSeconds({ get_uint: () => 0 }), 60, 'zero minutes clamps to one minute');
    eq(Settings.getWorkspaceId({ get_string: () => 'wrk_x' }), 'wrk_x', 'workspace accessor');
    eq(Settings.getAuthCookie({ get_string: () => 'st_y' }), 'st_y', 'cookie accessor');
    eq(Settings.getShowPanelBadge({ get_boolean: () => true }), true, 'panel badge accessor reads true');
    eq(Settings.getTrayDisplayMode({ get_string: () => 'weekly' }), 'weekly', 'tray display mode accessor');
    eq(Settings.getEnableNotifications({ get_boolean: () => true }), true, 'enable notifications accessor');
    eq(Settings.getNotificationThreshold({ get_uint: () => 80 }), 80, 'notification threshold accessor');
    eq(Settings.getCompactMode({ get_boolean: () => true }), true, 'compact mode accessor');
    eq(Settings.getHoverToOpen({ get_boolean: () => true }), true, 'hover-to-open accessor');
    eq(Settings.getWarnPercent({ get_uint: () => 75 }), 75, 'warn percent accessor');
    eq(Settings.getCriticalPercent({ get_uint: () => 90 }), 90, 'critical percent accessor');
    eq(Settings.getHistoryEnabled({ get_boolean: () => true }), true, 'history accessor');
    eq(Settings.getToggleShortcut({ get_strv: () => ['<Super><Alt>o'] })[0], '<Super><Alt>o', 'toggle shortcut accessor');
    eq(Settings.WATCHED_KEYS.join(','), 'workspace-id,auth-cookie,refresh-minutes,show-panel-badge,warn-percent,critical-percent,enable-history,tray-display-mode,enable-notifications,notification-threshold,compact-mode,toggle-shortcut,hover-to-open', 'watched keys cover every setting');
    // disconnect must not throw when there is nothing connected
    Settings.connectChanged({ connect: () => 1, disconnect: () => {} }, ['workspace-id'], () => {})();
    ok(true, 'connectChanged returns a working unsubscribe');
}

// --- prefs.js must match the GNOME 46+ loader contract ---
ok(typeof Prefs === 'function', 'prefs.js default export is constructible');
ok(typeof Prefs.prototype.fillPreferencesWindow === 'function', 'prefs.js exposes fillPreferencesWindow()');
// The shell already owns the Adw window and passes it in; a window subclass would
// build a second, unreachable window and leave the visible one empty on GNOME 46+.
ok(!(Prefs.prototype instanceof Adw.PreferencesWindow), 'prefs.js is a plain helper, not a window subclass');

// Summary and exit code for the runner
if (failures > 0) {
    printerr(`${failures} test(s) failed`);
    imports.system.exit(1);
} else {
    print('All contract tests passed');
}
