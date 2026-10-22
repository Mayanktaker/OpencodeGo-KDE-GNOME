// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// libadwaita preferences: multi-page General, Panel & Appearance, and Privacy & About

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import * as Api from './api.js';
import { getSettings } from './settings.js';
import { VERSION } from './version.js';

// Bounds for the refresh spin row, in minutes
const REFRESH_MIN = 1;
const REFRESH_MAX = 60;

// Bounds for usage alert threshold percentage
const NOTIFY_THRESHOLD_MIN = 50;
const NOTIFY_THRESHOLD_MAX = 95;

// Bounds for the warning/critical alert level spin rows
const ALERT_LEVEL_MIN = 0;
const ALERT_LEVEL_MAX = 100;

// Colours for the connection test result
const RESULT_OK_COLOR = '#26a269';
const RESULT_ERROR_COLOR = '#ff5555';

// Decodes GLib's waitpid-encoded spawn status to the child exit code
const exitCodeOf = status => (status & 0xff00) >> 8;

// Selectable keyboard shortcut options for toggling the popup menu
const SHORTCUT_OPTIONS = [
    { accel: '<Super><Alt>o', label: 'Super + Alt + O (Default)' },
    { accel: '<Control><Alt>o', label: 'Ctrl + Alt + O' },
    { accel: '<Super><Shift>o', label: 'Super + Shift + O' },
    { accel: '', label: 'Disabled' },
];

// Preferences object built by the shell then asked to fill the Adw window it owns
export default class OpenCodeGoPrefs {
    // Adds General, Panel & Appearance, and Privacy & About pages to the preferences window
    fillPreferencesWindow(window) {
        const settings = getSettings();
        window.add(this._buildGeneralPage(settings));
        window.add(this._buildAppearancePage(settings));
        window.add(this._buildAboutPage(settings));
    }

    // Builds the General page: Console Credentials, Cookie Guide, Connection Test, and Usage Alerts
    _buildGeneralPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });

        const credentials = new Adw.PreferencesGroup({
            title: 'Console Credentials',
            description: 'Paste your Workspace ID (or full Console URL) and "__Host-console_session" cookie',
        });
        page.add(credentials);

        // Workspace ID entry with automatic URL extraction when pasting a full console link
        const wsRow = new Adw.EntryRow({ title: 'Workspace ID (wrk_… or Console URL)' });
        settings.bind('workspace-id', wsRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        wsRow.connect('changed', () => {
            const raw = wsRow.text || '';
            const extracted = Api.extractWorkspaceId(raw);
            if (extracted && extracted !== raw.trim() && /^(wrk_|org_)/.test(extracted)) {
                wsRow.text = extracted;
            }
        });
        credentials.add(wsRow);

        // Session cookie entry with password reveal so the token is not left readable
        const cookieRow = new Adw.PasswordEntryRow({ title: 'Session Cookie (__Host-console_session, NOT "auth")' });
        settings.bind('auth-cookie', cookieRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        credentials.add(cookieRow);

        // Expandable browser guide explaining how to retrieve __Host-console_session
        const guideRow = new Adw.ExpanderRow({
            title: 'How to find your Session Cookie',
            subtitle: 'Step-by-step instructions for Chrome, Brave, Firefox &amp; Edge',
        });
        const steps = [
            ['1. Open OpenCode Console', 'Navigate to https://opencode.ai/console in your browser'],
            ['2. Open Developer Tools', 'Press F12 (or right-click → Inspect) to open the DevTools panel'],
            ['3. Find __Host-console_session', 'Go to Application tab (Storage in Firefox) → Cookies → https://opencode.ai'],
            ['4. Copy the Cookie Value', 'Copy the value of __Host-console_session (starts with st_...) and paste it above'],
            ['⚠️ Avoid "auth" (Fe26...) Cookie', 'Do NOT copy "auth". That cookie belongs to the marketing site and causes HTTP 401.'],
        ];
        for (const [title, subtitle] of steps) {
            guideRow.add_row(new Adw.ActionRow({ title, subtitle }));
        }
        credentials.add(guideRow);

        // One-shot connection check with automatic 5xx retry, mirroring the panel indicator
        const testRow = new Adw.ActionRow({
            title: 'Test Connection',
            subtitle: 'Verify credentials against the OpenCode Console API',
        });
        const testButton = new Gtk.Button({
            label: 'Test',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Fetch usage once with the details above',
        });
        testButton.connect('clicked', () => this._testConnection(settings, testButton, testRow));
        testRow.add_suffix(testButton);
        testRow.activatable_widget = testButton;
        credentials.add(testRow);

        // Quota alerts group
        const notifyGroup = new Adw.PreferencesGroup({ title: 'Usage Alerts' });
        page.add(notifyGroup);

        const notifyRow = new Adw.SwitchRow({
            title: 'Enable quota notifications',
            subtitle: 'Show a desktop notification when any window crosses the alert threshold',
        });
        settings.bind('enable-notifications', notifyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        notifyGroup.add(notifyRow);

        const thresholdRow = new Adw.SpinRow({
            title: 'Alert threshold (%)',
            subtitle: 'Trigger notification and draw a threshold marker on progress bars',
            adjustment: new Gtk.Adjustment({
                lower: NOTIFY_THRESHOLD_MIN, upper: NOTIFY_THRESHOLD_MAX, step_increment: 5,
                value: settings.get_uint('notification-threshold'),
            }),
        });
        settings.bind('notification-threshold', thresholdRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        notifyGroup.add(thresholdRow);

        // Per-meter switches so one noisy window can be silenced individually
        const meterRows = [
            ['notify-rolling', 'Alert for Rolling (5h)', 'Include the rolling window in quota alerts'],
            ['notify-weekly', 'Alert for Weekly', 'Include the weekly window in quota alerts'],
            ['notify-monthly', 'Alert for Monthly', 'Include the monthly window in quota alerts'],
        ];
        for (const [key, title, subtitle] of meterRows) {
            const row = new Adw.SwitchRow({ title, subtitle });
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            notifyGroup.add(row);
        }

        return page;
    }

    // Builds the Panel & Appearance page: badge modes, hover behavior, compact mode, and shortcut selector
    _buildAppearancePage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Panel & Appearance',
            icon_name: 'applications-graphics-symbolic',
        });

        const behaviour = new Adw.PreferencesGroup({
            title: 'Top Panel &amp; Popup Layout',
            description: 'Tip: Middle-click the panel icon to refresh immediately, or scroll over it to cycle metrics',
        });
        page.add(behaviour);

        // Panel percentage badge toggle
        const badgeRow = new Adw.SwitchRow({
            title: 'Show percentage in the panel',
            subtitle: 'Display numeric quota metric next to the branded O✦ panel icon',
        });
        settings.bind('show-panel-badge', badgeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviour.add(badgeRow);

        // Alert colour levels feeding the badge, bar colours and the threshold tick
        const warnRow = new Adw.SpinRow({
            title: 'Warning level (%)',
            subtitle: 'Bars, the threshold tick and the panel badge turn amber above this level',
            adjustment: new Gtk.Adjustment({
                lower: ALERT_LEVEL_MIN, upper: ALERT_LEVEL_MAX, step_increment: 1,
                value: settings.get_uint('warn-percent'),
            }),
        });
        settings.bind('warn-percent', warnRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        behaviour.add(warnRow);

        const criticalRow = new Adw.SpinRow({
            title: 'Critical level (%)',
            subtitle: 'Percentages above this level turn red; keep it above the warning level',
            adjustment: new Gtk.Adjustment({
                lower: ALERT_LEVEL_MIN, upper: ALERT_LEVEL_MAX, step_increment: 1,
                value: settings.get_uint('critical-percent'),
            }),
        });
        settings.bind('critical-percent', criticalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        behaviour.add(criticalRow);

        // Tray icon display mode selector
        const trayModes = [
            { id: 'weekly', name: 'Weekly Limit (Default)' },
            { id: 'fiveHour', name: '5-Hour Rolling Limit' },
            { id: 'monthly', name: 'Monthly Limit' },
            { id: 'all', name: 'All Three Limits (5h · W · M)' },
            { id: 'none', name: 'Icon Only' },
        ];
        const stringList = new Gtk.StringList();
        trayModes.forEach(m => stringList.append(m.name));

        const trayRow = new Adw.ComboRow({
            title: 'Tray Icon Display',
            subtitle: 'Choose which quota metrics appear in the top bar',
            model: stringList,
        });
        const currentMode = settings.get_string('tray-display-mode') || 'weekly';
        trayRow.selected = Math.max(0, trayModes.findIndex(m => m.id === currentMode));
        trayRow.connect('notify::selected', () => {
            const selectedItem = trayModes[trayRow.selected];
            if (selectedItem) settings.set_string('tray-display-mode', selectedItem.id);
        });
        behaviour.add(trayRow);

        // Hover-to-open switch with 160ms intent delay
        const hoverRow = new Adw.SwitchRow({
            title: 'Open popup on hover',
            subtitle: 'Automatically open the usage card after a brief hover over the panel icon',
        });
        settings.bind('hover-to-open', hoverRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviour.add(hoverRow);

        // Compact popup view toggle
        const compactRow = new Adw.SwitchRow({
            title: 'Compact popup view',
            subtitle: 'Condenses row spacing and moves reset countdowns inline for a smaller footprint',
        });
        settings.bind('compact-mode', compactRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviour.add(compactRow);

        // Refresh interval spin row, 1–60 minutes
        const refreshRow = new Adw.SpinRow({
            title: 'Refresh interval (minutes)',
            subtitle: 'How often the indicator polls your usage in the background',
            adjustment: new Gtk.Adjustment({
                lower: REFRESH_MIN, upper: REFRESH_MAX, step_increment: 1,
                value: settings.get_uint('refresh-minutes'),
            }),
        });
        settings.bind('refresh-minutes', refreshRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        behaviour.add(refreshRow);

        // Interactive keyboard shortcut selector group
        const shortcutGroup = new Adw.PreferencesGroup({ title: 'Keyboard Shortcut' });
        page.add(shortcutGroup);

        const shortcutModel = new Gtk.StringList();
        SHORTCUT_OPTIONS.forEach(s => shortcutModel.append(s.label));
        const shortcutRow = new Adw.ComboRow({
            title: 'Toggle Popup Shortcut',
            subtitle: 'Global shortcut to open or close the usage popup from anywhere',
            model: shortcutModel,
        });
        const currentAccel = (settings.get_strv('toggle-shortcut') || [])[0] || '';
        const accelIdx = SHORTCUT_OPTIONS.findIndex(s => s.accel === currentAccel);
        shortcutRow.selected = accelIdx >= 0 ? accelIdx : 0;
        shortcutRow.connect('notify::selected', () => {
            const chosen = SHORTCUT_OPTIONS[shortcutRow.selected];
            if (chosen) {
                settings.set_strv('toggle-shortcut', chosen.accel ? [chosen.accel] : []);
            }
        });
        shortcutGroup.add(shortcutRow);

        return page;
    }

    // Builds the Privacy & About page: security guarantees, credential wipe, and repository link
    _buildAboutPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Privacy & About',
            icon_name: 'help-about-symbolic',
        });

        const privacyGroup = new Adw.PreferencesGroup({
            title: 'Privacy &amp; Data Security',
            description: 'Transparent data handling according to GNOME extension security standards',
        });
        page.add(privacyGroup);

        const directRow = new Adw.ActionRow({
            title: 'Direct Network Connection',
            subtitle: 'Communicates solely with opencode.ai/console/api/go/status. No third-party servers, tracking, or telemetry.',
        });
        directRow.add_prefix(new Gtk.Image({ icon_name: 'security-high-symbolic' }));
        privacyGroup.add(directRow);

        const storageRow = new Adw.ActionRow({
            title: 'Local Storage Only',
            subtitle: 'Workspace ID and session tokens remain on this device inside your personal dconf settings.',
        });
        storageRow.add_prefix(new Gtk.Image({ icon_name: 'dialog-password-symbolic' }));
        privacyGroup.add(storageRow);

        // Optional local trend history, stored as percentages in ~/.cache
        const historyRow = new Adw.SwitchRow({
            title: 'Keep usage trend history',
            subtitle: 'Stores the last 7 days of usage percentages on this device to draw the trend sparkline and pace estimate. Turn off to keep no history at all.',
        });
        settings.bind('enable-history', historyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        privacyGroup.add(historyRow);

        const clearRow = new Adw.ActionRow({
            title: 'Clear Stored Credentials',
            subtitle: 'Erase saved Workspace ID and Session Cookie from local dconf settings',
        });
        clearRow.add_prefix(new Gtk.Image({ icon_name: 'user-trash-symbolic' }));
        const clearButton = new Gtk.Button({
            label: 'Clear',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        clearButton.connect('clicked', () => {
            settings.set_string('workspace-id', '');
            settings.set_string('auth-cookie', '');
            clearRow.subtitle = '<span color="#2dd4bf">Credentials cleared from local settings</span>';
        });
        clearRow.add_suffix(clearButton);
        clearRow.activatable_widget = clearButton;
        privacyGroup.add(clearRow);

        const aboutGroup = new Adw.PreferencesGroup({ title: 'About &amp; Legal Disclaimer' });
        page.add(aboutGroup);

        const disclaimerRow = new Adw.ActionRow({
            title: 'Third-Party Disclaimer',
            subtitle: 'OpenCode Go Usage Tracker is an independent open-source project and is not affiliated with, sponsored by, or endorsed by OpenCode.',
        });
        disclaimerRow.add_prefix(new Gtk.Image({ icon_name: 'dialog-information-symbolic' }));
        aboutGroup.add(disclaimerRow);

        const licenseRow = new Adw.ActionRow({
            title: `OpenCode Go Usage Tracker v${VERSION}`,
            subtitle: 'Licensed under MIT. © Mayanktaker Computers &amp; Web Development',
        });
        licenseRow.add_prefix(new Gtk.Image({ icon_name: 'help-about-symbolic' }));
        aboutGroup.add(licenseRow);

        const repoRow = new Adw.ActionRow({
            title: 'Source Code &amp; Issue Tracker',
            subtitle: 'github.com/Mayanktaker/OpencodeGo-KDE-GNOME',
        });
        repoRow.add_prefix(new Gtk.Image({ icon_name: 'web-browser-symbolic' }));
        const repoButton = new Gtk.Button({
            label: 'GitHub',
            valign: Gtk.Align.CENTER,
        });
        repoButton.connect('clicked', () => {
            Gio.AppInfo.launch_default_for_uri('https://github.com/Mayanktaker/OpencodeGo-KDE-GNOME', null);
        });
        repoRow.add_suffix(repoButton);
        repoRow.activatable_widget = repoButton;
        aboutGroup.add(repoRow);

        return page;
    }

    // Runs a console request (with 404 route-walk and 5xx retry) and reports the outcome on the row's subtitle
    _testConnection(settings, button, row) {
        const ws = Api.extractWorkspaceId(settings.get_string('workspace-id'));
        const cookie = settings.get_string('auth-cookie');

        // Reuse api.js validation so the message matches what the panel would show
        const problem = Api.checkWorkspaceIdError(ws) || Api.checkCookieError(cookie);
        if (problem) {
            this._report(row, problem, true);
            return;
        }

        button.sensitive = false;
        row.subtitle = 'Checking…';
        this._attemptTestRoute(ws, cookie, 0, 0, button, row);
    }

    // Executes one test curl attempt, retrying transient 5xx responses and walking routes on 404
    _attemptTestRoute(ws, cookie, routeIdx, attemptIdx, button, row) {
        const proc = Gio.Subprocess.new(['sh', '-c', Api.buildCurlCommand(ws, cookie, routeIdx)],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        proc.communicate_utf8_async(null, null, (obj, res) => {
            let stdout = '', stderr = '', exitStatus = 0;
            try {
                [, stdout, stderr] = obj.communicate_utf8_finish(res);
                exitStatus = exitCodeOf(obj.get_if_exited() ? obj.get_status() : 0);
            } catch (e) {
                button.sensitive = true;
                this._report(row, 'Could not reach the console. Check your internet connection.', true);
                return;
            }
            const result = Api.parseCurlOutput(stdout, stderr, exitStatus);
            if (!result.error && !result.data && result.httpStatus === 404) {
                if (routeIdx + 1 < Api.consoleRouteCount()) {
                    this._attemptTestRoute(ws, cookie, routeIdx + 1, 0, button, row);
                } else {
                    button.sensitive = true;
                    this._report(row, Api.noRouteError(), true);
                }
                return;
            }
            if (result.httpStatus >= 500 && attemptIdx + 1 < Api.maxAttemptsPerRoute()) {
                this._attemptTestRoute(ws, cookie, routeIdx, attemptIdx + 1, button, row);
                return;
            }
            button.sensitive = true;
            if (result.error) {
                this._report(row, result.error, true);
                return;
            }
            const percent = result.data.usagePercent;
            const hBar = (result.data.hourly && result.data.hourly[0]) ? ` · 5h ${result.data.hourly[0].value}%` : '';
            const mBar = (result.data.monthly && result.data.monthly[0]) ? ` · month ${result.data.monthly[0].value}%` : '';
            this._report(row, `Connected — weekly usage ${percent}%${hBar}${mBar}`, false);
        });
    }

    // Shows a pass/fail message on the action row's subtitle
    _report(row, text, failed) {
        const color = failed ? RESULT_ERROR_COLOR : RESULT_OK_COLOR;
        // markup_escape_text needs an explicit length; -1 means "to the end"
        row.subtitle = `<span color="${color}">${GLib.markup_escape_text(text, -1)}</span>`;
    }
}
