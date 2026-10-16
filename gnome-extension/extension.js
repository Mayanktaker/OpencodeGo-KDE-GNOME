// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Panel indicator: fetches Go usage via curl and shows a hover popup with the three windows

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import * as Api from './api.js';
import * as Settings from './settings.js';
import * as Popup from './popup.js';

// Decodes GLib's waitpid-encoded spawn status to the child exit code (gjs lacks the WEXITSTATUS macro)
const exitCodeOf = status => (status & 0xff00) >> 8;

// Branded O✦ logo shipped in the extension's own icons/ folder
const BRANDED_ICON_FILE = 'opencodego-symbolic.svg';

// Stock icon used when the branded one is missing
const FALLBACK_ICON_NAME = 'applications-system-symbolic';

// Console root; the workspace Go page is appended when a workspace id is known
const CONSOLE_URL_BASE = 'https://opencode.ai/console';

// Panel badge thresholds and colours, mirroring the KDE widget's panel badge
const BADGE_WARN_PERCENT = 75;
const BADGE_CRITICAL_PERCENT = 90;
const BADGE_WARN_COLOR = '#ffb86c';
const BADGE_CRITICAL_COLOR = '#ff5555';

// Hover intent delay (ms) so grazing the top bar does not accidentally pop open the menu
const HOVER_OPEN_DELAY_MS = 160;

// Cycle order when scrolling the mouse wheel over the panel indicator
const TRAY_CYCLE_MODES = ['weekly', 'fiveHour', 'monthly', 'all'];

// Builds the panel icon from the extension's own icons/ folder. GNOME Shell never
// adds an extension's icon directory to the icon theme, and StIconTheme only
// resolves freedesktop theme trees, so the SVG is loaded straight off disk.
function createPanelIcon(extensionPath) {
    const iconPath = GLib.build_filenamev([extensionPath, 'icons', BRANDED_ICON_FILE]);
    if (!GLib.file_test(iconPath, GLib.FileTest.EXISTS)) {
        console.warn(`${BRANDED_ICON_FILE} missing from ${extensionPath}/icons — using ${FALLBACK_ICON_NAME}`);
        return new St.Icon({ icon_name: FALLBACK_ICON_NAME, style_class: 'system-status-icon', y_align: Clutter.ActorAlign.CENTER });
    }
    return new St.Icon({
        gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(iconPath) }),
        style_class: 'system-status-icon',
        y_align: Clutter.ActorAlign.CENTER,
    });
}

// Colour for a panel badge percentage, or null to keep the theme foreground
function badgeColorFor(percent) {
    if (percent >= BADGE_CRITICAL_PERCENT) return BADGE_CRITICAL_COLOR;
    if (percent >= BADGE_WARN_PERCENT) return BADGE_WARN_COLOR;
    return null;
}

// Panel indicator button; hover opens the popup, click toggles it, middle-click refreshes
const OpenCodeGoIndicator = GObject.registerClass(
class OpenCodeGoIndicator extends PanelMenu.Button {
    // Wires the icon, hover-to-open behavior, middle-click/scroll actions, and initial state
    _init(extensionPath, actions) {
        super._init(0.0, 'OpenCode Go Usage', false);
        this._actions = actions || {};
        this._hoverToOpen = true;
        this._hoverTimerId = null;

        this.y_align = Clutter.ActorAlign.CENTER;
        this.y_expand = true;

        // Icon plus the optional percentage badge, side by side in the panel
        this._box = new St.BoxLayout({
            style_class: 'opencodego-panel-box',
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        const icon = createPanelIcon(extensionPath);
        icon.set_y_align(Clutter.ActorAlign.CENTER);
        icon.set_y_expand(true);
        this._box.add_child(icon);

        this._badge = new St.Label({
            style_class: 'opencodego-panel-badge',
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        this._badge.clutter_text.y_align = Clutter.ActorAlign.CENTER;
        this._badge.clutter_text.ellipsize = 0;
        this._box.add_child(this._badge);
        this.add_child(this._box);

        // Fetch state machine shared with popup.js
        this._state = { status: 'demo', data: null, error: null };
        this._lastAlertedPercent = 0;

        // Hover opens the popup after a brief intent delay when enabled in settings
        this.connect('enter-event', () => {
            if (!this._hoverToOpen || this.menu.isOpen) return Clutter.EVENT_PROPAGATE;
            if (this._hoverTimerId) GLib.source_remove(this._hoverTimerId);
            this._hoverTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_OPEN_DELAY_MS, () => {
                this._hoverTimerId = null;
                if (this._hoverToOpen && !this.menu.isOpen) this.menu.open();
                return GLib.SOURCE_REMOVE;
            });
            return Clutter.EVENT_PROPAGATE;
        });

        // Cancel pending hover-open if pointer leaves before the intent delay expires
        this.connect('leave-event', () => {
            if (this._hoverTimerId) {
                GLib.source_remove(this._hoverTimerId);
                this._hoverTimerId = null;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Middle-click forces an immediate usage refresh without opening the menu
        this.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === 2) {
                if (this.menu.isOpen) this.menu.close();
                this.refresh();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Mouse wheel scroll cycles which quota metric is displayed in the panel badge
        this.connect('scroll-event', (_actor, event) => {
            const dir = event.get_scroll_direction();
            if (dir === Clutter.ScrollDirection.UP && this._actions.onCycleTrayMode) {
                this._actions.onCycleTrayMode(-1);
                return Clutter.EVENT_STOP;
            }
            if (dir === Clutter.ScrollDirection.DOWN && this._actions.onCycleTrayMode) {
                this._actions.onCycleTrayMode(1);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Re-run the 250ms bar fill animation whenever the popup menu is opened
        this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen) {
                const popupMod = this._popupModule || Popup;
                popupMod.buildMenuContent(this.menu, this._state, this._actions, this._compactMode, this._notifyThreshold, this._shortcutAccel);
            }
        });

        // Initial paint with demo data so the popup is never empty
        this._setState({ status: 'demo', data: Api.getMockData(), error: null });
    }

    // Paints the panel badge, or hides it when the user turned it off
    _updateBadge() {
        const show = this._showBadge;
        const mode = this._trayMode || 'weekly';
        const data = this._state.data;

        if (!show || mode === 'none' || !data) {
            this._badge.visible = false;
            return;
        }

        const hourlyBar = (data.hourly && data.hourly.length) ? data.hourly[0] : null;
        const weeklyBar = (data.weekly && data.weekly.length) ? data.weekly[0] : null;
        const monthlyBar = (data.monthly && data.monthly.length) ? data.monthly[0] : null;

        const hPct = hourlyBar ? Math.round(Api.calculatePercentage(hourlyBar.value, hourlyBar.maxValue)) : 0;
        const wPct = (data.usagePercent !== undefined && data.usagePercent !== null)
            ? Math.round(data.usagePercent)
            : (weeklyBar ? Math.round(Api.calculatePercentage(weeklyBar.value, weeklyBar.maxValue)) : 0);
        const mPct = monthlyBar ? Math.round(Api.calculatePercentage(monthlyBar.value, monthlyBar.maxValue)) : 0;

        let text = '';
        let headlineColor = null;

        if (mode === 'all') {
            text = `5h ${hPct}% · W ${wPct}% · M ${mPct}%`;
            headlineColor = badgeColorFor(Math.max(hPct, wPct, mPct));
        } else if (mode === 'fiveHour') {
            text = `${hPct}%`;
            headlineColor = badgeColorFor(hPct);
        } else if (mode === 'monthly') {
            text = `${mPct}%`;
            headlineColor = badgeColorFor(mPct);
        } else {
            // Default: weekly headline percentage
            text = `${wPct}%`;
            headlineColor = badgeColorFor(wPct);
        }

        this._badge.visible = true;
        this._badge.text = text;
        this._badge.style = headlineColor ? `color: ${headlineColor};` : '';
    }

    // Rebuilds popup content from state
    _setState(state) {
        this._state = state;
        this._updateBadge();
        const popupMod = this._popupModule || Popup;
        popupMod.buildMenuContent(this.menu, state, this._actions, this._compactMode, this._notifyThreshold, this._shortcutAccel);
    }

    // Runs one curl request honoring the route-walk and retry rules from api.js
    refresh() {
        // Single in-flight guard: a hover-triggered open or a settings edit never stacks curl processes
        if (this._inFlight) return;
        const ws = Api.extractWorkspaceId(this._workspaceId);
        const cookie = this._authCookie;

        // No credentials -> demo mode, same as the KDE widget
        if (!cookie || !cookie.trim() || !ws || !ws.trim()) {
            this._finish({ status: 'demo', data: Api.getMockData(), error: null });
            return;
        }
        const cookieErr = Api.checkCookieError(cookie);
        const wsErr = Api.checkWorkspaceIdError(ws);
        if (cookieErr || wsErr) {
            this._finish({ status: 'error', data: null, error: cookieErr || wsErr });
            return;
        }

        this._inFlight = true;
        this._route = 0;
        this._attempt = 0;
        this._attemptRoute(ws, cookie);
    }

    // Fires curl for the current candidate route asynchronously so the shell never blocks on the network
    _attemptRoute(ws, cookie) {
        const cmd = Api.buildCurlCommand(ws, cookie, this._route);
        let proc;
        try {
            // curl command is a shell string (api.js source of truth), so run it through sh -c
            proc = Gio.Subprocess.new(['sh', '-c', cmd], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            this._finish({ status: 'error', data: null, error: 'Network unreachable. Please check your internet connection.' });
            return;
        }
        this._request = proc;
        proc.communicate_utf8_async(null, null, (obj, res) => {
            // A disable() during the request must not resurrect the indicator
            if (this._request !== obj) return;
            this._request = null;
            let stdout = '', stderr = '', exitStatus = -1;
            try {
                [, stdout, stderr] = obj.communicate_utf8_finish(res);
                exitStatus = exitCodeOf(obj.get_if_exited() ? obj.get_status() : 0);
            } catch (e) {
                this._finish({ status: 'error', data: null, error: 'Network unreachable. Please check your internet connection.' });
                return;
            }
            this._handleOutput(stdout, stderr, exitStatus);
        });
    }

    // Applies parse rules: 404 walks routes, 5xx retries in place, otherwise finalize
    _handleOutput(stdout, stderr, exitStatus) {
        const result = Api.parseCurlOutput(stdout, stderr, exitStatus);
        // 404 only means the route moved: advance to the next candidate, in place
        if (!result.error && !result.data && result.httpStatus === 404) {
            if (this._route + 1 < Api.consoleRouteCount()) {
                this._route += 1;
                this._attempt = 0;
                this._attemptRoute(this._workspaceId, this._authCookie);
            } else {
                this._finish({ status: 'error', data: null, error: Api.noRouteError() });
            }
            return;
        }
        // 5xx is transient: retry the same route before giving up
        if (result.httpStatus >= 500 && this._attempt + 1 < Api.maxAttemptsPerRoute()) {
            this._attempt += 1;
            this._attemptRoute(this._workspaceId, this._authCookie);
            return;
        }
        if (result.error) {
            // Transient 5xx keeps only real live figures; mock data must never pose as "last known figures"
            if (result.httpStatus >= 500 && this._state.data && !this._state.data.isMock)
                this._finish({ status: 'transient', data: this._state.data, error: result.error });
            else
                this._finish({ status: 'error', data: null, error: result.error });
            return;
        }
        this._finish({ status: 'ok', data: result.data, error: null });
    }

    // Applies a terminal state, releases the in-flight slot and arms the next poll
    _finish(state) {
        this._inFlight = false;
        this._setState(state);
        this._scheduleNext();
        this._checkNotification(state);
    }

    // Displays a desktop notification when quota crosses the configured alert threshold
    _checkNotification(state) {
        if (!this._enableNotifications || !state.data || state.data.isMock) return;
        const data = state.data;
        const threshold = this._notifyThreshold || 80;

        const hourlyBar = (data.hourly && data.hourly.length) ? data.hourly[0] : null;
        const weeklyBar = (data.weekly && data.weekly.length) ? data.weekly[0] : null;
        const monthlyBar = (data.monthly && data.monthly.length) ? data.monthly[0] : null;

        const hPct = hourlyBar ? Math.round(Api.calculatePercentage(hourlyBar.value, hourlyBar.maxValue)) : 0;
        const wPct = (data.usagePercent !== undefined && data.usagePercent !== null)
            ? Math.round(data.usagePercent)
            : (weeklyBar ? Math.round(Api.calculatePercentage(weeklyBar.value, weeklyBar.maxValue)) : 0);
        const mPct = monthlyBar ? Math.round(Api.calculatePercentage(monthlyBar.value, monthlyBar.maxValue)) : 0;

        const maxPct = Math.max(hPct, wPct, mPct);

        // Alert when any window crosses threshold, or triggers critical level at >=95%
        if (maxPct >= threshold && (this._lastAlertedPercent || 0) < threshold) {
            this._lastAlertedPercent = maxPct;
            const alerts = [];
            if (hPct >= threshold) alerts.push(`Rolling: ${hPct}%`);
            if (wPct >= threshold) alerts.push(`Weekly: ${wPct}%`);
            if (mPct >= threshold) alerts.push(`Monthly: ${mPct}%`);
            const detail = alerts.join(', ');
            Main.notify('OpenCode Go Quota Alert', `High usage detected (${detail}).`);
        } else if (maxPct >= 95 && (this._lastAlertedPercent || 0) < 95) {
            this._lastAlertedPercent = 95;
            Main.notify('OpenCode Go Quota Critical', `Usage capacity has reached ${maxPct}%. Check OpenCode Go console.`);
        } else if (maxPct < threshold) {
            this._lastAlertedPercent = 0;
        }
    }

    // Aborts any in-flight curl so a settings change is not answered by stale credentials
    cancelRequest() {
        // Nulling the handle first makes the pending callback bail out without applying stale data
        if (this._request) { this._request.force_exit(); this._request = null; }
        this._inFlight = false;
    }

    // Arms the GLib timer for the next refresh; rebuilt whenever settings change
    _scheduleNext() {
        if (this._timerId) GLib.source_remove(this._timerId);
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._refreshSeconds, () => {
            this._timerId = null;
            this.refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Stops timers, kills any in-flight curl, and leaves nothing behind for disable()
    destroy() {
        if (this._hoverTimerId) { GLib.source_remove(this._hoverTimerId); this._hoverTimerId = null; }
        if (this._timerId) { GLib.source_remove(this._timerId); this._timerId = null; }
        this.cancelRequest();
        super.destroy();
    }
});

// Extension lifecycle: creates the indicator, reads settings, subscribes to changes
export default class OpenCodeGoExtension extends Extension {
    // Called on login/enable: build indicator, load settings, first fetch
    enable() {
        this._settings = Settings.getSettings();
        this._indicator = new OpenCodeGoIndicator(this.path, {
            onRefresh: () => this._indicator.refresh(),
            onOpenConsole: () => this._openConsole(),
            onOpenSettings: () => this._openSettings(),
            onCycleTrayMode: step => this._cycleTrayMode(step),
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');

        // Settings reader bound onto the indicator so refresh() always sees current values
        this._applySettings = () => {
            this._indicator._workspaceId = Settings.getWorkspaceId(this._settings);
            this._indicator._authCookie = Settings.getAuthCookie(this._settings);
            this._indicator._refreshSeconds = Settings.getRefreshSeconds(this._settings);
            this._indicator._showBadge = Settings.getShowPanelBadge(this._settings);
            this._indicator._trayMode = Settings.getTrayDisplayMode(this._settings);
            this._indicator._enableNotifications = Settings.getEnableNotifications(this._settings);
            this._indicator._notifyThreshold = Settings.getNotificationThreshold(this._settings);
            this._indicator._compactMode = Settings.getCompactMode(this._settings);
            this._indicator._hoverToOpen = Settings.getHoverToOpen(this._settings);
            this._indicator._shortcutAccel = (Settings.getToggleShortcut(this._settings) || [])[0] || '';
        };
        this._applySettings();
        this._unsub = Settings.connectChanged(this._settings, Settings.WATCHED_KEYS, () => {
            this._applySettings();
            // Drop any in-flight request so new credentials take effect on the next poll
            this._indicator.cancelRequest();
            // The badge can be toggled without re-fetching, so repaint straight away
            this._indicator._updateBadge();
            this._indicator._setState(this._indicator._state);
            this._indicator.refresh();
        });

        // Register keyboard shortcut to toggle popup menu
        try {
            if (Main.wm && Main.wm.addKeybinding) {
                Main.wm.addKeybinding(
                    Settings.KEY_TOGGLE_SHORTCUT,
                    this._settings,
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                    () => {
                        if (this._indicator && this._indicator.menu) this._indicator.menu.toggle();
                    }
                );
                this._hasKeybinding = true;
            }
        } catch (e) {
            console.warn(`Could not register toggle-shortcut: ${e.message}`);
        }

        // Reload popup.js bypassing GJS's static ES module cache when cycling disable/enable
        import(`./popup.js?v=${Date.now()}`).then(mod => {
            if (this._indicator) {
                this._indicator._popupModule = mod;
                this._indicator._setState(this._indicator._state);
            }
        }).catch(() => {});

        this._indicator.refresh();
    }

    // Called on disable/logout: tear down everything this extension created
    disable() {
        if (this._hasKeybinding && Main.wm && Main.wm.removeKeybinding) {
            try {
                Main.wm.removeKeybinding(Settings.KEY_TOGGLE_SHORTCUT);
            } catch (e) {}
            this._hasKeybinding = false;
        }
        if (this._unsub) { this._unsub(); this._unsub = null; }
        if (this._indicator) { this._indicator.destroy(); this._indicator = null; }
        this._applySettings = null;
        this._settings = null;
    }

    // Cycles the panel badge mode when the user scrolls over the top-bar indicator
    _cycleTrayMode(step) {
        if (!this._settings) return;
        const current = Settings.getTrayDisplayMode(this._settings);
        const idx = Math.max(0, TRAY_CYCLE_MODES.indexOf(current));
        const nextIdx = (idx + step + TRAY_CYCLE_MODES.length) % TRAY_CYCLE_MODES.length;
        this._settings.set_string(Settings.KEY_TRAY_MODE, TRAY_CYCLE_MODES[nextIdx]);
    }

    // Opens extension preferences dialog with fallback if dbus is unavailable
    _openSettings() {
        try {
            this.openPreferences();
        } catch (e) {
            console.warn('openPreferences failed, falling back to subprocess: ' + e.message);
            try {
                Gio.Subprocess.new(['gnome-extensions', 'prefs', this.uuid], Gio.SubprocessFlags.NONE);
            } catch (err) {}
        }
    }

    // Opens this workspace's Go page in the default browser; the plain console
    // when no workspace is configured yet, so the entry is never a dead link
    _openConsole() {
        const ws = Api.extractWorkspaceId(this._indicator?._workspaceId);
        const url = ws ? `${CONSOLE_URL_BASE}/${ws}/go` : CONSOLE_URL_BASE;
        try {
            Gio.AppInfo.launch_default_for_uri(url, null);
        } catch (e) {
            Main.notifyError('OpenCode Go Usage', `Could not open ${url}`);
        }
    }
}
