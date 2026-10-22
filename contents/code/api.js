// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// API logic module for fetching, parsing, and exporting OpenCode Go subscription usage data

// Browser-like User-Agent reused by every curl call so the console accepts the request
var USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// OpenCode Console session cookie name; a bare pasted token is assumed to be this cookie
var CONSOLE_SESSION_COOKIE = "__Host-console_session";
// Candidate console API routes for the Go status payload, tried in order so a server-side rename
// costs one retry instead of a hard failure. %ORG% is replaced with the workspace/org id.
// Route 0 is what the console itself calls for a normal account (verified 2026-09); route 1 is
// the support-staff variant, which answers 403 for regular accounts.
var CONSOLE_STATUS_ROUTES = [
    "https://opencode.ai/console/api/go/status",
    "https://opencode.ai/console/api/internal/orgs/%ORG%/go/status",
    "https://opencode.ai/console/api/orgs/%ORG%/go/status",
    "https://opencode.ai/console/api/v2/orgs/%ORG%/go/status",
    "https://opencode.ai/console/api/v1/orgs/%ORG%/go/status"
];
// curl -w marker carrying the HTTP status code after the response body
var HTTP_STATUS_MARKER = "HTTPSTATUS:";

// Calculates integer percentage from used and total values safely
function calculatePercentage(used, total) {
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}

// Cookie names the console has used; only these are trusted as a name=value header
var KNOWN_COOKIE_NAMES = ["__Host-console_session", "console_session", "auth"];

// True when the pasted value already carries one of the known cookie names
// (anchored to the start or a ";" separator so a bare token containing e.g.
// "auth=" is not misclassified as a full header)
function hasKnownCookieName(val) {
    var v = String(val || "").trim();
    for (var i = 0; i < KNOWN_COOKIE_NAMES.length; i++) {
        var n = KNOWN_COOKIE_NAMES[i];
        if (v.indexOf(n + "=") === 0) return true;
        if (v.indexOf("; " + n + "=") !== -1) return true;
        if (v.indexOf(";" + n + "=") !== -1) return true;
    }
    return false;
}

// Normalizes a user-pasted credential into a valid HTTP Cookie header value
function buildCookieHeader(authCookie) {
    var val = (authCookie || "").trim();
    // Strip surrounding quotes left by a careless copy from DevTools
    if (val.length >= 2 && ((val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') ||
        (val.charAt(0) === "'" && val.charAt(val.length - 1) === "'"))) {
        val = val.slice(1, -1).trim();
    }
    if (!val) return "";
    // A full Cookie header or a name=value pair with a known name passes through untouched
    if (hasKnownCookieName(val)) {
        return val;
    }
    // Bare legacy iron-session seal pasted without its cookie name
    if (val.indexOf("Fe26") === 0) {
        return "auth=" + val;
    }
    // Any other bare value is a console session token — even when it contains "="
    // (e.g. base64 padding), so the cookie name is supplied explicitly
    return CONSOLE_SESSION_COOKIE + "=" + val;
}
// True when the error is a transient console outage that should keep last known figures
function isTransientError(err) {
    var msg = String(err || "");
    return msg.indexOf("temporarily unavailable") !== -1 ||
        msg.indexOf("Retrying on the next refresh") !== -1;
}

// Generates realistic mock usage data when no workspace credentials are provided
function getMockData() {
    var hourlyData = [];
    var currentHour = new Date().getHours();
    for (var i = 0; i < 24; i++) {
        var hourLabel = (i < 10 ? "0" + i : "" + i) + ":00";
        var val = (i === currentHour) ? 38 : Math.floor(Math.sin(i / 3) * 20 + 25);
        hourlyData.push({ label: hourLabel, value: val, maxValue: 50 });
    }

    var days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var weeklyData = [];
    var currentDay = (new Date().getDay() + 6) % 7;
    for (var d = 0; d < 7; d++) {
        var dayVal = (d === currentDay) ? 680 : [420, 550, 710, 640, 890, 310, 250][d];
        weeklyData.push({ label: days[d], value: dayVal, maxValue: 1000 });
    }

    var monthlyData = [
        { label: "Week 1", value: 3450, maxValue: 5000 },
        { label: "Week 2", value: 4120, maxValue: 5000 },
        { label: "Week 3", value: 3890, maxValue: 5000 },
        { label: "Week 4", value: 2950, maxValue: 5000 }
    ];

    var activeWeeklyUsed = weeklyData[currentDay].value;
    var activeWeeklyMax = weeklyData[currentDay].maxValue;
    var usagePercent = calculatePercentage(activeWeeklyUsed, activeWeeklyMax);

    return {
        isMock: true,
        planName: "OpenCode Go (Demo Mode)",
        billingPeriod: "Aug 01 - Aug 31",
        usagePercent: usagePercent,
        // Demo reset countdowns so the per-window brackets are visible without real credentials
        resetSeconds: { hourly: 13500, weekly: 370800, monthly: 1659600 },
        hourly: hourlyData,
        weekly: weeklyData,
        monthly: monthlyData,
        lastRefreshed: new Date().toLocaleTimeString()
    };
}

// Wraps a string in POSIX single quotes so it is safe to inline in a shell command
function shellQuote(s) {
    // Single-quote the value, escaping any embedded single quotes via '\"'\"'
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

// Validates the pasted auth credential and returns a user-facing error message, or "" when usable
function checkCookieError(authCookie) {
    var raw = String(authCookie || "").trim();
    if (raw.indexOf("Fe26") === 0 || raw.indexOf("auth=Fe26") === 0 || (raw.indexOf("auth=") === 0 && raw.indexOf("Fe26") !== -1)) {
        return "You pasted the 'auth' cookie (Fe26...). OpenCode Console requires the '__Host-console_session' cookie. In DevTools → Application → Cookies → opencode.ai, copy the value of '__Host-console_session' instead.";
    }
    var finalCookie = buildCookieHeader(authCookie);
    if (!finalCookie) return "";
    // Detect truncated cookie values copied from browser DevTools table
    if (finalCookie.indexOf("...") !== -1) {
        return "Auth Cookie is truncated (...). Double-click the cell in DevTools to copy the entire value, or copy the full Cookie header from the Network tab.";
    }
    // Console session tokens are short and opaque, so only an implausibly short value is rejected
    var value = finalCookie.slice(finalCookie.indexOf("=") + 1);
    if (value.length < 16) {
        return "Auth Cookie looks incomplete. Copy the whole '__Host-console_session' cookie value from opencode.ai (DevTools -> Application -> Cookies).";
    }
    return "";
}

// Extracts a wrk_ or org_ identifier from a pasted OpenCode Console URL or bare string
function extractWorkspaceId(workspaceId) {
    var raw = String(workspaceId || "").trim();
    if (!raw) return "";
    var match = raw.match(/\b((?:wrk|org)_[A-Za-z0-9_-]+)\b/);
    return match ? match[1] : raw;
}

// Validates the workspace id against the console's own accepted formats (wrk_/org_)
function checkWorkspaceIdError(workspaceId) {
    var ws = extractWorkspaceId(workspaceId);
    if (!ws) return "";
    if (!/^(wrk_|org_)/.test(ws)) {
        return "Workspace ID must start with 'wrk_' (or 'org_'). Copy it from the console URL: opencode.ai/console/wrk_XXXXXXXX/go";
    }
    return "";
}

// Error shown when every candidate console route came back 404 (the API path moved again)
function noRouteError() {
    return "OpenCode Console API route not found. The endpoint may have moved — check for a widget update.";
}

// Number of candidate console routes the caller may walk through
function consoleRouteCount() {
    return CONSOLE_STATUS_ROUTES.length;
}

// Attempts allowed per route before a transient server error (5xx) is reported to the user
function maxAttemptsPerRoute() {
    return 4;
}

// Builds the Go status URL for a candidate route index, clamping the index into range
function buildStatusUrl(workspaceId, routeIndex) {
    var ws = extractWorkspaceId(workspaceId);
    var idx = parseInt(routeIndex, 10);
    if (isNaN(idx) || idx < 0) idx = 0;
    if (idx > CONSOLE_STATUS_ROUTES.length - 1) idx = CONSOLE_STATUS_ROUTES.length - 1;
    // %ORG% carries the workspace id in the path for the support-staff route variant
    return CONSOLE_STATUS_ROUTES[idx].replace("%ORG%", encodeURIComponent(ws));
}

// Builds the curl shell command used to fetch Go status JSON. Qt's QML XMLHttpRequest strips the
// Cookie header, so we shell out to curl which honors it; the executable Plasma dataengine runs it.
function buildCurlCommand(workspaceId, authCookie, routeIndex) {
    var ws = extractWorkspaceId(workspaceId);
    var cookie = buildCookieHeader(authCookie);
    var url = buildStatusUrl(ws, routeIndex);
    // -sSL: silent + show errors + follow redirects (so a dead session surfaces as JSON 401)
    // --max-time: bound the request so the widget never hangs
    // -w: append the HTTP status so the caller can tell "path moved" (404) from "bad session" (401)
    var parts = [
        "curl", "-sSL", "--max-time", "15",
        "-H", shellQuote("Cookie: " + cookie),
        "-H", shellQuote("User-Agent: " + USER_AGENT),
        "-H", shellQuote("Accept: application/json"),
        // x-org-id is the console's own workspace selector header
        "-H", shellQuote("x-org-id: " + ws),
        "-H", shellQuote("Referer: https://opencode.ai/console/" + ws + "/go"),
        "-w", shellQuote(HTTP_STATUS_MARKER + "%{http_code}"),
        shellQuote(url)
    ];
    return parts.join(" ");
}

// Splits curl's -w status marker off the captured stdout into a body and an HTTP status code
function splitHttpStatus(stdout) {
    var raw = String(stdout || "");
    var idx = raw.lastIndexOf(HTTP_STATUS_MARKER);
    if (idx === -1) return { body: raw, httpStatus: 0 };
    var status = parseInt(raw.slice(idx + HTTP_STATUS_MARKER.length), 10);
    return { body: raw.slice(0, idx), httpStatus: isNaN(status) ? 0 : status };
}

// Parses the captured curl output (stdout JSON, stderr text, exit code) into the widget model.
// httpStatus is surfaced so the caller can walk to the next candidate route on a 404.
function parseCurlOutput(stdout, stderr, exitCode) {
    // curl exit 28 = timeout, 6 = DNS, 7 = connection refused, etc.
    if (exitCode && parseInt(exitCode, 10) !== 0) {
        // Non-zero exit: surface a helpful network/auth message
        var code = parseInt(exitCode, 10);
        if (code === 28) return { error: "Request timed out. Server did not respond within 15s.", data: null, httpStatus: 0 };
        if (code === 6 || code === 7) return { error: "Network unreachable. Please check your internet connection.", data: null, httpStatus: 0 };
        // Other codes still may have produced a useful body on stdout — try parsing it
    }
    var split = splitHttpStatus(stdout);
    // 404 means this candidate path is not served at all — the caller retries instead of reporting
    if (split.httpStatus === 404) {
        return { error: null, data: null, httpStatus: 404 };
    }
    // The console requires the workspace id in its own header, so a 400 signals a widget bug
    if (split.httpStatus === 400) {
        return { error: "Console API rejected the request (400) — check the Workspace ID.", data: null, httpStatus: 400 };
    }
    // Transient backend failures (seen during a console deploy) clear on the next refresh tick
    if (split.httpStatus >= 500) {
        return { error: "OpenCode Console is temporarily unavailable (HTTP " + split.httpStatus + "). Retrying on the next refresh.", data: null, httpStatus: split.httpStatus };
    }
    var body = split.body;
    if (!body.trim()) {
        if (stderr) return { error: "curl failed: " + String(stderr).slice(0, 200), data: null, httpStatus: split.httpStatus };
        return { error: "Console API returned an empty response (HTTP " + split.httpStatus + ").", data: null, httpStatus: split.httpStatus };
    }
    try {
        return { error: null, data: parseAnyResponse(body), httpStatus: split.httpStatus };
    } catch (e) {
        return { error: e.message, data: null, httpStatus: split.httpStatus };
    }
}

// Detects the OpenAuth login page returned when auth credentials are rejected
function isOpenAuthLoginPage(text) {
    // Anchor on markers unique to the OpenAuth login page instead of a loose substring match
    return text.indexOf("<title>OpenAuth</title>") !== -1 ||
           text.indexOf("openauth.js.org") !== -1 ||
           text.indexOf("/github/authorize") !== -1 ||
           text.indexOf("/google/authorize") !== -1 ||
           text.indexOf("Continue with GitHub") !== -1 ||
           text.indexOf("Continue with Google") !== -1;
}

// Detects the OpenCode Console SPA shell, which is HTML and therefore never carries usage data
function isConsoleShell(text) {
    return text.indexOf("<title>OpenCode Console</title>") !== -1 ||
           text.indexOf("/console/assets/index-") !== -1;
}

// Formats a seconds countdown into a natural multi-unit label (e.g. "3 hours 45 minutes")
function formatResetFull(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    if (sec <= 0) return "";
    var days = Math.floor(sec / 86400);
    var hours = Math.floor((sec % 86400) / 3600);
    var minutes = Math.floor((sec % 3600) / 60);
    var parts = [];
    if (days > 0) parts.push(days + (days === 1 ? " day" : " days"));
    if (hours > 0) parts.push(hours + (hours === 1 ? " hour" : " hours"));
    if (minutes > 0) parts.push(minutes + (minutes === 1 ? " minute" : " minutes"));
    if (parts.length === 0) {
        parts.push(sec + (sec === 1 ? " second" : " seconds"));
    }
    return parts.join(" ");
}

// Formats a seconds countdown into a compact two-unit label (e.g. "3h 45m" or "4d 7h")
function formatResetCompact(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    if (sec <= 0) return "";
    var days = Math.floor(sec / 86400);
    var hours = Math.floor((sec % 86400) / 3600);
    var minutes = Math.floor((sec % 3600) / 60);
    if (days > 0) return hours > 0 ? days + "d " + hours + "h" : days + "d";
    if (hours > 0) return minutes > 0 ? hours + "h " + minutes + "m" : hours + "h";
    if (minutes > 0) return minutes + "m";
    return sec + "s";
}

// Coerces the API's micro-cents values (BigInt serialized as a string, e.g. "125000000") into a Number
function toMicroCents(value) {
    if (value === undefined || value === null || value === "") return 0;
    var n = Number(String(value).replace(/n$/, ""));
    return isNaN(n) ? 0 : n;
}

// Mirrors the console's own round-half-up percentage so widget and website always agree
function meterPercent(usedMicroCents, limitMicroCents) {
    if (!(limitMicroCents > 0)) return 0;
    var pct = Math.floor((usedMicroCents * 200 + limitMicroCents) / (limitMicroCents * 2));
    return Math.min(100, Math.max(0, pct));
}

// Formats micro-cents into a human readable USD string e.g. $4.80 or $20.00
function formatCurrency(microCents) {
    if (microCents === undefined || microCents === null || isNaN(microCents)) return "$0.00";
    var dollars = Number(microCents) / 100000000;
    return "$" + dollars.toFixed(2);
}

// Converts an ISO date (or epoch seconds/milliseconds) into seconds remaining from now, 0 when unknown
function secondsUntil(value) {
    if (value === undefined || value === null || value === "") return 0;
    var raw = String(value).trim();
    var numeric = Number(raw);
    var ms;
    if (raw !== "" && !isNaN(numeric) && /^[0-9.]+$/.test(raw)) {
        // Values below 1e11 are epoch seconds, above are epoch milliseconds
        ms = numeric < 1e11 ? numeric * 1000 : numeric;
    } else {
        ms = new Date(raw).getTime();
    }
    if (isNaN(ms)) return 0;
    return Math.max(0, Math.round((ms - Date.now()) / 1000));
}

// Extracts the usage windows from the authenticated SolidJS Go page's inlined store state (legacy HTML)
function parseSolidUsageStore(responseText) {
    // The three rolling usage windows the legacy OpenCode Go page exposed
    var windows = ["rollingUsage", "weeklyUsage", "monthlyUsage"];
    var results = {};
    var found = false;
    for (var i = 0; i < windows.length; i++) {
        var key = windows[i];
        var keyIdx = responseText.indexOf(key + ":$R");
        if (keyIdx === -1) continue;
        found = true;
        // Read a fixed-size chunk after the marker to tolerate slightly different field ordering
        var chunk = responseText.substr(keyIdx, 300);
        var pctMatch = chunk.match(/usagePercent[^\d]*(\d+)/);
        var resetMatch = chunk.match(/resetInSec:(\d+)/);
        // Only record the window when its percentage was actually found
        if (pctMatch) {
            results[key] = parseInt(pctMatch[1], 10);
            if (resetMatch) results[key + "Reset"] = parseInt(resetMatch[1], 10);
        }
    }
    if (!found) return null;

    // Headline badge follows the same weekly-quota convention the widget's mock data uses
    var headline = results.weeklyUsage !== undefined ? results.weeklyUsage
                  : (results.monthlyUsage !== undefined ? results.monthlyUsage
                  : (results.rollingUsage !== undefined ? results.rollingUsage : 0));
    // Reset countdown of the headline window (weekly first), exposed for the header
    var headlineResetSec = results.weeklyUsageReset !== undefined ? results.weeklyUsageReset
                         : (results.monthlyUsageReset !== undefined ? results.monthlyUsageReset
                         : (results.rollingUsageReset !== undefined ? results.rollingUsageReset : 0));

    return {
        isMock: false,
        planName: "OpenCode Go Usage Tracker",
        billingPeriod: "Rolling / Weekly / Monthly",
        usagePercent: headline,
        // Per-window reset countdowns (seconds) used by the per-window bracket labels
        resetSeconds: {
            hourly: results.rollingUsageReset || 0,
            weekly: results.weeklyUsageReset || 0,
            monthly: results.monthlyUsageReset || 0
        },
        hourly: results.rollingUsage !== undefined ? [{ label: "Rolling", value: results.rollingUsage, maxValue: 100 }] : [],
        weekly: results.weeklyUsage !== undefined ? [{ label: "Weekly", value: results.weeklyUsage, maxValue: 100 }] : [],
        monthly: results.monthlyUsage !== undefined ? [{ label: "Monthly", value: results.monthlyUsage, maxValue: 100 }] : [],
        lastRefreshed: new Date().toLocaleTimeString()
    };
}

// Parses the OpenCode Console go/status JSON (access.meters.fiveHour/week/month) into the widget model.
// Returns null when the payload is not the console shape so other parsers can try.
function parseConsoleGoStatus(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    var access = data.access;
    if (!access || typeof access !== "object" || !access.meters) return null;
    var meters = access.meters || {};

    // Each meter reports micro-cents spent against its own limit, so percentages are derived locally
    var fiveHour = meters.fiveHour;
    var week = meters.week;
    var month = meters.month;
    if (!fiveHour && !week && !month) return null;

    var fiveHourUsed = fiveHour ? toMicroCents(fiveHour.usedMicroCents) : 0;
    var fiveHourLimit = fiveHour ? toMicroCents(fiveHour.limitMicroCents) : 0;
    var weekUsed = week ? toMicroCents(week.usedMicroCents) : 0;
    var weekLimit = week ? toMicroCents(week.limitMicroCents) : 0;
    var monthUsed = month ? toMicroCents(month.usedMicroCents) : 0;
    var monthLimit = month ? toMicroCents(month.limitMicroCents) : 0;

    var fiveHourPct = fiveHourLimit > 0 ? meterPercent(fiveHourUsed, fiveHourLimit) : 0;
    var weekPct = weekLimit > 0 ? meterPercent(weekUsed, weekLimit) : 0;
    var monthPct = monthLimit > 0 ? meterPercent(monthUsed, monthLimit) : 0;

    return {
        isMock: false,
        planName: "OpenCode Go Usage Tracker",
        billingPeriod: "Rolling / Weekly / Monthly",
        // Headline badge keeps the widget's weekly-quota convention
        usagePercent: week ? weekPct : (month ? monthPct : fiveHourPct),
        // Per-window reset countdowns in seconds; the month window resets when the paid period ends
        resetSeconds: {
            hourly: fiveHour ? secondsUntil(fiveHour.resetsAt) : 0,
            weekly: week ? secondsUntil(week.resetsAt) : 0,
            monthly: secondsUntil(access.endsAt)
        },
        hourly: fiveHour ? [{
            label: "Rolling",
            value: fiveHourPct,
            maxValue: 100,
            usedMicroCents: fiveHourUsed,
            limitMicroCents: fiveHourLimit,
            usedFormatted: formatCurrency(fiveHourUsed),
            limitFormatted: formatCurrency(fiveHourLimit),
            remainingFormatted: formatCurrency(Math.max(0, fiveHourLimit - fiveHourUsed)) + " left"
        }] : [],
        weekly: week ? [{
            label: "Weekly",
            value: weekPct,
            maxValue: 100,
            usedMicroCents: weekUsed,
            limitMicroCents: weekLimit,
            usedFormatted: formatCurrency(weekUsed),
            limitFormatted: formatCurrency(weekLimit),
            remainingFormatted: formatCurrency(Math.max(0, weekLimit - weekUsed)) + " left"
        }] : [],
        monthly: month ? [{
            label: "Monthly",
            value: monthPct,
            maxValue: 100,
            usedMicroCents: monthUsed,
            limitMicroCents: monthLimit,
            usedFormatted: formatCurrency(monthUsed),
            limitFormatted: formatCurrency(monthLimit),
            remainingFormatted: formatCurrency(Math.max(0, monthLimit - monthUsed)) + " left"
        }] : [],
        lastRefreshed: new Date().toLocaleTimeString()
    };
}

// Smart parser capable of extracting usage data from console JSON, legacy Next.js HTML, or page text
function parseAnyResponse(responseText) {
    var trimmed = responseText.trim();

    // Case 1: Direct JSON payload (the console API path)
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        var json = null;
        try {
            json = JSON.parse(trimmed);
        } catch (e) {}
        if (json !== null) {
            // The console reports auth/permission problems as a tagged error object
            if (json._tag === "Unauthorized") {
                throw new Error("Auth Cookie is invalid or expired. Please update Auth Cookie in settings.");
            }
            if (json._tag === "Forbidden") {
                throw new Error("Console API denied access (403). If this keeps happening, check for a widget update.");
            }
            if (json._tag === "BadRequest") {
                throw new Error("Console API rejected the request (400) — check the Workspace ID.");
            }
            if (json._tag === "InternalServerError") {
                throw new Error("OpenCode Console is temporarily unavailable (500). Retrying on the next refresh.");
            }
            var consoleModel = parseConsoleGoStatus(json);
            if (consoleModel) return consoleModel;
            // No Go subscription attached to this workspace
            if (json.access === null || json.access === undefined) {
                throw new Error("This workspace has no active OpenCode Go subscription.");
            }
            return parseUsageResponse(json);
        }
    }

    // Case 2: OpenAuth login page returned (auth cookie invalid/expired)
    if (isOpenAuthLoginPage(trimmed)) {
        throw new Error("Auth Cookie is invalid or expired. Please update Auth Cookie in settings.");
    }

    // Case 3: Console SPA shell returned instead of JSON — the widget is pointed at an HTML route
    if (isConsoleShell(trimmed)) {
        throw new Error("Console returned HTML instead of JSON. Update the widget, or re-check the Workspace ID.");
    }

    // Case 4: Embedded __NEXT_DATA__ JSON in HTML (legacy site)
    var nextDataMatch = responseText.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch && nextDataMatch[1]) {
        try {
            var nextObj = JSON.parse(nextDataMatch[1]);
            var props = nextObj.props || {};
            var pageProps = props.pageProps || {};
            var usageObj = pageProps.usage || pageProps.data || pageProps;
            return parseUsageResponse(usageObj);
        } catch (e) {}
    }

    // Case 5: Legacy SolidJS store state inlined on the authenticated Go page
    var solidModel = parseSolidUsageStore(responseText);
    if (solidModel) {
        return solidModel;
    }

    // Case 6: Regex pattern extraction for usagePercent values embedded in the page text
    var usagePercentMatch = responseText.match(/usagePercent[^\d]*(\d+)/i);
    if (usagePercentMatch) {
        var windowPct = parseInt(usagePercentMatch[1], 10);
        return {
            isMock: false,
            planName: "OpenCode Go Usage Tracker",
            billingPeriod: "Current Cycle",
            usagePercent: windowPct,
            resetSeconds: {},
            hourly: [],
            weekly: [{ label: "Usage", value: windowPct, maxValue: 100 }],
            monthly: [],
            lastRefreshed: new Date().toLocaleTimeString()
        };
    }

    throw new Error("Could not parse usage metrics. Server returned an unexpected response.");
}

// Parses raw JSON response from OpenCode API into widget consumption model
function parseUsageResponse(data) {
    if (!data) data = {};
    return {
        isMock: false,
        planName: data.planName || data.name || "OpenCode Go Plan",
        billingPeriod: data.billingPeriod || data.period || "Current Billing Cycle",
        usagePercent: data.usagePercent || calculatePercentage(data.currentUsed || data.used || 0, data.currentLimit || data.limit || 100),
        resetSeconds: data.resetSeconds || {},
        hourly: data.hourly || [],
        weekly: data.weekly || [],
        monthly: data.monthly || [],
        lastRefreshed: new Date().toLocaleTimeString()
    };
}

// Generates formatted CSV content from usage data model
function generateCSV(data) {
    if (!data) return "";
    var lines = [];
    lines.push("Category,Label,Used,MaxLimit,Percentage");

    var weekly = data.weekly || [];
    for (var i = 0; i < weekly.length; i++) {
        var w = weekly[i];
        var pct = calculatePercentage(w.value, w.maxValue);
        lines.push("Weekly," + w.label + "," + w.value + "," + w.maxValue + "," + pct + "%");
    }

    var monthly = data.monthly || [];
    for (var m = 0; m < monthly.length; m++) {
        var mo = monthly[m];
        var pctMo = calculatePercentage(mo.value, mo.maxValue);
        lines.push("Monthly," + mo.label + "," + mo.value + "," + mo.maxValue + "," + pctMo + "%");
    }

    return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Local usage history: samples live fetches for the 24h trend chart and the
// per-window burn-rate chips. Storage itself lives in the plasmoid config as a
// JSON string (written by main.qml); these helpers are pure so QML and tests
// can drive them without I/O.

// Two samples closer than this are one observation (also caps config churn)
var HISTORY_MIN_GAP_MS = 300000;

// 24h of samples at the 5-minute floor gap keeps the config blob tiny
var HISTORY_MAX_SAMPLES = 288;

// The trend chart covers the newest 24 hours
var HISTORY_WINDOW_MS = 86400000;

// The slope estimate uses the newest 6 hours inside one reset window
var HISTORY_PACE_WINDOW_MS = 21600000;

// Meter keys shared by the popup rows and the history samples
var HISTORY_METERS = ["hourly", "weekly", "monthly"];

// Parses the persisted JSON (or returns a fresh empty store keyed to wsId)
function historyFromConfig(jsonString, wsId) {
    try {
        var parsed = JSON.parse(jsonString || "");
        if (parsed && parsed.ws === wsId && Object.prototype.toString.call(parsed.samples) === "[object Array]") {
            return parsed;
        }
    } catch (e) {}
    return { ws: wsId, samples: [] };
}

// Extracts the micro-cent meter pairs of one parsed payload; null when not live data
function historyMetersOf(data) {
    if (!data || data.isMock) return null;
    var meters = {};
    for (var i = 0; i < HISTORY_METERS.length; i++) {
        var key = HISTORY_METERS[i];
        var bar = data[key] && data[key].length ? data[key][0] : null;
        if (bar && bar.usedMicroCents !== undefined && bar.limitMicroCents !== undefined) {
            meters[key] = [Number(bar.usedMicroCents) || 0, Number(bar.limitMicroCents) || 0];
        }
    }
    return Object.keys(meters).length ? meters : null;
}

// Appends (or refreshes) one sample; returns the updated store, not yet persisted
function historyAppend(store, wsId, data, nowMs) {
    var meters = historyMetersOf(data);
    if (!store || store.ws !== wsId) store = { ws: wsId, samples: [] };
    if (!meters) return store;
    var last = store.samples.length ? store.samples[store.samples.length - 1] : null;
    if (last && nowMs - last.t < HISTORY_MIN_GAP_MS) {
        last.t = nowMs;
        last.m = meters;
        return store;
    }
    store.samples.push({ t: nowMs, m: meters });
    if (store.samples.length > HISTORY_MAX_SAMPLES) {
        store.samples.splice(0, store.samples.length - HISTORY_MAX_SAMPLES);
    }
    return store;
}

// Percent of one meter pair, or -1 when the meter is absent
function historyPercent(meters, key) {
    var pair = meters ? meters[key] : null;
    if (!pair || !(pair[1] > 0)) return -1;
    return meterPercent(pair[0], pair[1]);
}

// Points {t, pct} of one meter inside the newest 24h window
function historyTrend(store, key, nowMs) {
    var points = [];
    if (!store || !store.samples) return points;
    var cutoff = nowMs - HISTORY_WINDOW_MS;
    for (var i = 0; i < store.samples.length; i++) {
        var s = store.samples[i];
        if (s.t < cutoff) continue;
        var pct = historyPercent(s.m, key);
        if (pct >= 0) points.push({ t: s.t, pct: pct });
    }
    return points;
}

// Burn-rate estimate for one meter: slope over the newest samples inside the
// reset window; null when flat, declining, or too few points
function historyPace(store, key, resetsSec, nowMs) {
    if (!(resetsSec > 0)) return null;
    var points = historyTrend(store, key, nowMs);
    if (points.length < 2) return null;
    var windowStart = nowMs - Math.min(HISTORY_PACE_WINDOW_MS, Math.floor(resetsSec) * 1000);
    var slice = [];
    for (var i = 0; i < points.length; i++) {
        if (points[i].t >= windowStart) slice.push(points[i]);
    }
    if (slice.length < 2) return null;
    var first = slice[0];
    var last = slice[slice.length - 1];
    var hours = (last.t - first.t) / 3600000;
    if (hours <= 0) return null;
    var rate = (last.pct - first.pct) / hours;
    if (!(rate > 0.01)) return null;
    var projected = last.pct + rate * (Math.floor(resetsSec) / 3600);
    return { ratePctPerHour: rate, projectedPct: projected };
}

// Chip label for a pace estimate, or "" when none
function historyPaceText(pace) {
    if (!pace) return "";
    var projected = Math.max(0, Math.round(pace.projectedPct));
    return projected >= 100 ? "⚠ ~" + projected + "%" : "↗ ~" + projected + "%";
}
