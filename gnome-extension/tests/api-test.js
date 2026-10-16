// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Plain-assert smoke tests for the GJS port of the console API logic

import * as Api from '../api.js';

// Minimal assert helpers so gjs runs without any dependency
let failures = 0;
function ok(cond, msg) {
    if (!cond) { console.error('FAIL: ' + msg); failures++; }
}
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// --- cookie normalization ---
eq(Api.buildCookieHeader('st_abcdefghijklmnopqrstuvwxyz'), '__Host-console_session=st_abcdefghijklmnopqrstuvwxyz', 'bare token wrapped with host cookie');
eq(Api.buildCookieHeader('abc=='), '__Host-console_session=abc==', 'bare token with padding still wrapped whole');
eq(Api.buildCookieHeader('Fe26.2**abc'), 'auth=Fe26.2**abc', 'legacy iron seal mapped to auth');
eq(Api.buildCookieHeader('__Host-console_session=x; console_session=y'), '__Host-console_session=x; console_session=y', 'full header passthrough');
eq(Api.buildCookieHeader('"__Host-console_session=x"'), '__Host-console_session=x', 'devtools quotes stripped');

// --- validation ---
ok(Api.checkCookieError('st_abcdefghijklmnopqrstuvwxyz') === '', 'valid cookie passes');
ok(Api.checkCookieError('short') !== '', 'short cookie rejected');
ok(Api.checkCookieError('Fe26.2**abcdefghijklmnop').indexOf('__Host-console_session') !== -1, 'Fe26 cookie detected with helpful error');
ok(Api.checkWorkspaceIdError('wrk_abc') === '', 'wrk id valid');
ok(Api.checkWorkspaceIdError('https://opencode.ai/console/wrk_01J9XYZ/go') === '', 'full console URL valid via auto-extract');
eq(Api.extractWorkspaceId('https://opencode.ai/console/wrk_01J9XYZ/go'), 'wrk_01J9XYZ', 'extracts wrk id from URL');
eq(Api.extractWorkspaceId('https://opencode.ai/console/org_998877/settings'), 'org_998877', 'extracts org id from URL');
ok(Api.checkWorkspaceIdError('xyz') !== '', 'bad workspace rejected');

// --- status marker split uses LAST occurrence ---
let split = Api.splitHttpStatus('{"a":"HTTPSTATUS:200"}HTTPSTATUS:404');
eq(split.httpStatus, 404, 'last marker wins');
eq(split.body, '{"a":"HTTPSTATUS:200"}', 'body preserved before last marker');

// --- percentage mirrors the console formula ---
eq(Api.meterPercent(0, 10), 0, 'zero usage is zero');
eq(Api.meterPercent(5, 10), 50, 'half is half');
eq(Api.meterPercent(999, 10), 100, 'clamped to 100');
eq(Api.meterPercent(5, 0), 0, 'no limit means zero');

// --- console JSON parsing ---
let payload = {
    access: {
        endsAt: '2030-01-01T00:00:00Z',
        meters: {
            fiveHour: { usedMicroCents: '125000000', limitMicroCents: '500000000', resetsAt: '2030-01-01T01:00:00Z' },
            week: { usedMicroCents: '250000000', limitMicroCents: '1000000000', resetsAt: '2030-01-01T00:00:00Z' },
            month: { usedMicroCents: '2500000000', limitMicroCents: '10000000000' }
        }
    }
};
let model = Api.parseCurlOutput(JSON.stringify(payload), '', 0);
eq(model.error, null, 'console payload parses without error');
eq(model.data.usagePercent, 25, 'weekly headline percent from micro-cents');
eq(model.data.weekly[0].value, 25, 'weekly bar value');
eq(model.data.weekly[0].remainingFormatted, '$7.50 left', 'weekly remaining formatted');
eq(model.data.monthly[0].value, 25, 'monthly bar value');
ok(model.data.resetSeconds.monthly > 0, 'monthly reset from access.endsAt');

// --- tagged error responses ---
let authBody = JSON.stringify({ _tag: 'Unauthorized' });
eq(Api.parseCurlOutput(authBody, '', 0).error, "Auth Cookie is invalid or expired. OpenCode Console requires the '__Host-console_session' cookie value from opencode.ai/console.", '401 tag message');
eq(Api.parseCurlOutput('{"_tag":"BadRequest"}', '', 0).error, 'Console API rejected the request (400) — check the Workspace ID.', '400 tag message');

// --- literal 404 route walk signal and 5xx retry signal ---
let emptyResult = Api.parseCurlOutput('', '', 0);
eq(emptyResult.httpStatus, 0, 'empty output keeps HTTP 0');
eq(emptyResult.error, 'Console API returned an empty response (HTTP 0).', 'empty output reports empty response');
eq(Api.parseCurlOutput('HTTPSTATUS:404', '', 0).httpStatus, 404, 'literal 404 signals route-moved');
eq(Api.parseCurlOutput('HTTPSTATUS:500', '', 0).httpStatus, 500, '5xx surfaced for in-place retry');

// --- curl command shape ---
let cmd = Api.buildCurlCommand('wrk_x', 'st_abcdefghijklmnop', 0);
ok(cmd.indexOf('x-org-id') !== -1 && cmd.indexOf('wrk_x') !== -1, 'curl carries org header');
ok(cmd.indexOf('--max-time 15') !== -1, 'curl bounded at 15s');
ok(cmd.indexOf("'") !== -1, 'shell-quoted arguments present');

// --- demo mode ---
let mock = Api.getMockData();
ok(mock.isMock === true && mock.weekly.length > 0, 'mock data shaped for demo mode');

// --- reset formatting ---
eq(Api.formatResetFull(0), '', 'zero reset renders empty');
ok(Api.formatResetFull(13500).indexOf('hour') !== -1, 'hours shown in countdown');
eq(Api.formatResetCompact(0), '', 'zero compact reset renders empty');
eq(Api.formatResetCompact(13500), '3h 45m', 'compact hours and minutes');
eq(Api.formatResetCompact(370800), '4d 7h', 'compact days and hours');

// Summary and exit code for the runner
if (failures > 0) {
    console.error(failures + ' test(s) failed');
    throw new Error(failures + ' test(s) failed');
} else {
    print('All api tests passed');
}
