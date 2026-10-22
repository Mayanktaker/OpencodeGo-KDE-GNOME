<!-- © Mayanktaker Computers & Web Development | https://mayanktaker.com -->
# Changelog — OpenCode Go Usage Tracker

## v2.9.0

**What's new**
- **See where you're heading, not just where you are.** The popup now includes a 24-hour usage trend chart beneath the bars, with faint guide lines at your warning and critical levels — one glance shows how fast each window is climbing.
- **Know before you hit the wall.** Every window carries a pace estimate: a calm "on pace for ~84% by reset", or a clear warning like "hits ~112%" when the limit will be crossed before the window resets.
- **Your numbers survive a restart.** After a reboot or logout the card instantly restores your last known figures — clearly marked as stale until the fresh data lands — instead of starting out empty.
- **Alert levels that fit you.** Choose the percentage where bars and the panel badge turn amber and red, instead of fixed defaults, from the new Panel & Appearance settings.
- **Quota alerts that do something.** The desktop notification now has an Open Console button, so you can jump straight to topping up without hunting for the panel icon.
- **History you control.** The trend data lives only in your own cache folder, and a new privacy switch turns it off completely if you'd rather not keep any.

## v2.8.2

**What's new**
- The GNOME extension's About section now shows the exact release you have installed, so you can confirm your build at a glance.
- Every download now comes with a single checksum file that covers the whole bundle, so you can confirm all files are intact in one step.

**Bug fixes**
- The published checksum file now lists the file names exactly as they appear in your download folder, so verifying a release no longer fails on the GNOME extension archives.

## v2.8.1

**What's new**
- Redesigned the GNOME usage popup card to match the compact card layout: a header with a live status pill (`LIVE`, `DEMO MODE`, `STALE`, `AUTH ERROR`), timestamp/weekly summary subtitle, and three circular header buttons for **Refresh** (`↻`), **Open Console** (`↗`), and **Settings** (`⚙`) — removing the tall bottom menu rows.
- Added smooth 250ms animated horizontal gradient fills and an alert threshold marker on all three progress bars, with `$used / $limit ($left)` and compact `↻ 3h 33m` reset badges balanced underneath each bar.
- Added a bottom footer bar showing your active keyboard shortcut and a one-click **Copy Summary** (`📋 Copy Summary`) button that copies your Rolling, Weekly, and Monthly usage figures to the clipboard.
- Upgraded the GNOME top-bar "All Three Limits" badge to clean tabular labels (`5h · W · M`), added middle-click to refresh immediately, scroll-wheel over the panel icon to cycle displayed limits, and a configurable hover-to-open switch with a short delay so passing your mouse over the top bar never opens the menu by accident.
- Organized GNOME Preferences into three clean tabs (**General**, **Panel & Appearance**, and **Privacy & About**), added a keyboard shortcut selector, and allowed pasting your full OpenCode Console link into the Workspace ID box (in both GNOME and KDE Settings) to extract the ID automatically.
- The GNOME extension now uses the standard `opencodego-usage@mayanktaker.com` identity required by extensions.gnome.org, so store validation passes cleanly.

**Bug fixes**
- Fixed the GNOME top-bar item so it now matches the spacing of your other indicators: the logo and percentage sit neatly side by side instead of drifting apart, the hover highlight is a full-height pill like your neighbours, and the usage card now opens with a proper gap below the top bar instead of hugging it.
- Fixed a journal warning where progress-bar animation timers kept repainting destroyed popup actors across disable/enable cycles.
- Fixed Pango markup ampersand warnings in the GNOME Preferences window so all section titles and subtitles display properly.
- Fixed long error messages stretching the GNOME popup menu across the screen by wrapping status and error banners inside a fixed-width card with a direct "Open Credentials Settings" button.
- Fixed an awkward left indentation on the reset countdown text and restored compact inline reset timers when Compact Popup View is enabled.
- Made the "Test Connection" button in GNOME Preferences automatically retry temporary server hiccups before reporting an error.
- Removed a redundant settings entry from the GNOME extension's description file that triggered a reviewer warning.
- The installer now retires the old, pre-rename install folder automatically, so you never end up with two copies of the extension.
- Updated the About version label to match this release.

## v2.8.0

**What's new**
- Added a dedicated "Privacy & Data Security" section in Settings explaining data handling, local storage, and transparent direct connections.
- Added a "Clear Stored Credentials" button in Settings to easily wipe saved credentials from this device with one click.
- Added an "About & Legal Disclaimer" section in Settings with full attribution, open-source license, and direct links to source code.
- Added global keyboard shortcut support (<Super><Alt>o) to toggle the usage popup menu from anywhere on your desktop.
- Added visual loading feedback when clicking Refresh in the GNOME popup, showing progress and preventing duplicate clicks.
- Enhanced usage quota notifications to simultaneously monitor Rolling (5h), Weekly, and Monthly limits, plus critical capacity alerts at 95%.
- Added automated SHA256 checksum verification for all release zip packages and GitHub release assets.

**Bug fixes**
- Settings dialog is fully compliant with extensions.gnome.org (EGO) security, transparency, and data handling standards.
- Excluded precompiled schema binaries from distribution archives to strictly conform to GNOME Extensions validator guidelines.

## v2.7.0

**What's new**
- Repository officially renamed to **OpencodeGo-KDE-GNOME** to reflect full native support for both KDE Plasma 6 and GNOME Shell (46–50).
- Live loading feedback on the in-popup "Refresh" button in GNOME Shell: shows "Refreshing…" and temporarily disables clicks while data is in flight.
- Automated distribution publishing for all GNOME Shell `.shell-extension.zip` bundles in GitHub Releases.
- Updated documentation and quick-start installation guides for both KDE Plasma and GNOME desktop environments.

**Bug fixes**
- Updated all upstream GitHub repository URLs, clone instructions, and issue tracker links across the entire project suite.

## v2.6.0

**What's new**
- Clean monochrome tray icon for GNOME Shell top panel that renders crisply across light, dark, and custom system themes.
- Original vibrant full-color OpenCode Go `<O✦>` brand artwork displayed proudly inside the popup card header.
- Added an in-popup "Refresh" action button right before "Open OpenCode Console" that updates usage numbers instantly without closing the popup menu.
- Streamlined popup card design with cleaner typography and removed row icons for a sleek, uncluttered presentation.
- Interactive Session Cookie Guide built directly into the GNOME preferences window with step-by-step instructions.
- Interactive terminal setup wizard (`opencode-usage --interactive` / `-i`) to test and save credentials for both KDE and GNOME in seconds.
- Smarter cookie helper that immediately warns if an `auth` marketing token was copied instead of the required `__Host-console_session` token.

**Bug fixes**
- Fixed misleading authentication error messages by detecting marketing website cookies before testing connection.
- Fixed tray icon scaling in custom GNOME Shell themes by utilizing standard monochrome symbolic geometry.

## v2.5.1

**What's new**
- Redesigned GNOME panel icon with crisp, balanced proportions and vibrant brand colors that match standard desktop tray sizes.
- Added visible usage limit numbers (e.g. $4.80 / $20.00) directly beside your percentages in the popup card.
- New tray display selector in Settings: choose whether the panel shows your Weekly Limit, 5-Hour Rolling Limit, Monthly Limit, All Three Limits with icons, or Icon Only.
- Added a Compact View option in Settings to reduce popup height and spacing for smaller screens.
- Polished GNOME popup card with a branded header, distinct icons for Rolling, Weekly, and Monthly usage windows, and clear status badges.
- Smooth rounded progress bars with custom color accents (sky, cyan, and teal) and automatic warning highlights as usage increases.
- Added optional desktop notifications when usage crosses a chosen percentage threshold.
- Terminal CLI now displays formatted limit amounts and automatically detects GNOME extension settings.

**Bug fixes**
- Fixed the GNOME Settings link not opening when clicked from the popup menu.
- Fixed the GNOME panel tray icon appearing vertically squished and blurry.
- Fixed the vertical and horizontal center alignment between the tray icon and the usage percentage text.
- Fixed invisible or faint progress bars in the GNOME popup card across light and dark desktop themes.

## v2.5.0

**What's new**
- The usage tracker now runs on GNOME Shell too — a small panel icon that shows your Rolling (5h), Weekly, and Monthly usage when you hover it.
- The GNOME panel now shows your weekly percentage next to the icon, turning orange at 75% and red at 90% — the same idea as the KDE taskbar badge. You can turn it off in settings if you prefer the icon on its own.
- The GNOME panel icon now shows the same O✦ logo as the KDE widget.
- The GNOME popup has "Open OpenCode Console" and "Settings…" entries, and both still work when your sign-in has expired.
- GNOME settings now include a "Test" button that checks your details straight away instead of making you wait for a refresh.
- On GNOME you get a simple settings window for your sign-in details and how often the numbers refresh.
- Trying it on GNOME? No sign-in details yet? It shows sample numbers so you can see how it looks first.
- The downloadable bundle now includes the GNOME extension, and new builds always pick up the current version number.

**Bug fixes**
- Fixed the GNOME panel icon not appearing at all after a fresh install.
- Fixed the GNOME settings window not opening its contents.
- Fixed the GNOME "Test" button getting stuck on "Checking…" and never reporting back.
- Fixed your GNOME numbers being replaced by an error message during a brief OpenCode outage — it now keeps your last known figures, just like the KDE widget.
- Fixed the GNOME popup showing its contents twice after a refresh.
- Fixed GNOME waiting on the network in the background, which could make the desktop feel stuck while checking your usage.

## v2.4.0

**What's new**
- Works with the new OpenCode sign-in — paste your current session cookie and your numbers load.
- The first bar now reads Rolling (5h), so it's clear what time window it shows.
- When OpenCode has a brief outage, the widget keeps your last numbers on screen with a friendly note instead of going blank.
- Pasting your cookie is more forgiving — full rows, quoted copies, and older formats are all accepted.

**Bug fixes**
- Fixed the setup screen wrongly rejecting the new short session cookie.
- Fixed the "invalid config" dead-end when OpenCode moved its usage page.
- The widget now retries automatically during OpenCode's brief outages.

## v2.3.0

**What's new**
- Follows OpenCode to its new usage page and shows the same Rolling, Weekly, and Monthly numbers you see on the website.
- Clearer messages when your sign-in expires or a workspace has no subscription.

**Bug fixes**
- Fixed the widget going blank after OpenCode retired its old usage page.
