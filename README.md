<!-- © Mayanktaker Computers & Web Development | https://mayanktaker.com -->
# 📊 OpenCode Go Usage Tracker — KDE Plasma 6 & GNOME Shell Extension

[![KDE Plasma](https://img.shields.io/badge/KDE-Plasma%206.0%2B-blue?logo=kde)](https://kde.org)
[![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-46%E2%80%9351-blue?logo=gnome)](https://www.gnome.org/)
[![Qt](https://img.shields.io/badge/Qt-6.5%2B-green?logo=qt)](https://www.qt.io/)
[![License](https://img.shields.io/badge/License-MIT-brightgreen.svg)](LICENSE)

A unified Linux desktop companion and command-line utility for tracking your **OpenCode Go** subscription usage across **Rolling (5h)**, **Weekly**, and **Monthly** quota windows — featuring native integrations for **KDE Plasma 6**, **GNOME Shell (46–51)**, and any terminal via the **`opencode-usage`** CLI.

---

## 📸 Screenshots

| Light Theme | Settings | Dark Theme |
|:---:|:---:|:---:|
| ![Light Theme](screenshots/image-1.png) | ![Settings](screenshots/image-2.png) | ![Dark Theme](screenshots/image-3.png) |

---

## 🌟 Key Features

- 🎨 **Redesigned Brand Logo (`<O✦>`)**: Custom cyan-teal vector logo combining code brackets `< >`, central ring `O`, and glowing spark `✦`, integrated seamlessly across panel icons, header containers, SVGs, and system theme icon sizes (16px–128px).
- 🐧 **Full GNOME Shell Extension**:
  - Pure monochrome symbolic icon (`opencodego-symbolic.svg`) matching GNOME Shell top-bar indicators, with spacing and hover pill that match the native indicators.
  - Full-color glowing brand header in popup card (`opencodego-brand.svg`).
  - Redesigned usage card: live status pill (`LIVE` / `DEMO MODE` / `STALE` / `AUTH ERROR`), timestamp + weekly summary, and round **Refresh** / **Open Console** / **Settings** buttons in the header.
  - Animated horizontal-gradient progress bars with an alert-threshold marker, plus `$used / $limit ($left)` and a compact `↻ 4h 35m` reset badge under every bar.
  - **24-hour usage trend sparkline** under the bars, with faint guide lines at your warning and critical levels, so you can see how fast you're climbing at a glance.
  - **Burn-rate estimate** on every window — `↗ ~84% by reset` when you're on pace, or `⚠ hits ~112%` when the limit will be crossed before the window resets.
  - **Figures survive a restart** — after a reboot or logout the card instantly restores your last known numbers (clearly marked as stale) instead of starting empty.
  - **Your own alert levels** — pick the percentage where bars and the panel badge turn amber and red, instead of living with fixed defaults.
  - **Actionable quota alerts** — the desktop notification carries an *Open Console* button, so topping up takes one click from the banner itself.
  - **Private by design** — the optional trend history stays in your own cache folder and can be switched off entirely from the Privacy tab.
  - **Copy Summary** button that puts your Rolling, Weekly, and Monthly figures on the clipboard.
  - Instant in-popup **Refresh** button that updates figures live without dismissing the menu.
  - Global keyboard shortcut (`<Super><Alt>o`) to toggle the popup instantly from anywhere, and a middle-click that refreshes on the spot.
  - Scroll over the panel icon to cycle the displayed limit; a hover-to-open switch stops the card popping up when your mouse merely passes the top bar.
  - Libadwaita Preferences split into **General**, **Panel & Appearance**, and **Privacy & About** tabs, with an interactive **Test Connection** (auto-retries temporary server hiccups), step-by-step **Session Cookie Guide**, and EGO-compliant **Privacy & Data Security** controls.
  - Paste your whole `opencode.ai/console/…` link into the Workspace ID box and the ID is pulled out for you.
  - Flexible top-bar display modes: Weekly Limit (Default), 5-Hour Rolling Limit, Monthly Limit, All Three Limits (`5h · W · M`), or Icon Only.
  - Multi-window quota alert notifications (Rolling, Weekly, Monthly) and Compact Mode toggle.
- 📊 **Real-Time Usage Tracking**: Fetches live data from the OpenCode Console JSON API `opencode.ai/console/api/go/status` via `curl`. Supports route-walk resilience, transient 5xx retry handling, and graceful stale-figures fallback.
- ⏱️ **Per-Window Reset Countdowns**: Natural-language `(resets in 3 hours 45 minutes)` countdowns for Rolling (5h), Weekly, and Monthly windows.
- 📐 **Horizontal Progress Bars**: Smooth rounded progress bars with responsive color accents (sky, cyan, teal) and automatic warning shifts (≥75% orange, ≥90% red).
- 🏷️ **Dynamic Panel Tray Badge**: Real-time headline usage percentage badge directly in your desktop top bar or taskbar.
- 🎨 **12 Developer Theme Presets (KDE)**: Catppuccin Mocha (default), Breeze Dark, Nord, Dracula, Solarized, Gruvbox, Tokyo Night, One Dark, plus 4 light themes with full color pickers.
- 💻 **Global CLI Utility (`opencode-usage`)**: Terminal client with formatted tables, JSON mode (`--json`), CSV export (`--export`), and interactive setup wizard (`--interactive` / `-i`).
- 📦 **Open Source**: Full source, issue tracker, and releases on [GitHub](https://github.com/Mayanktaker/OpencodeGo-KDE-GNOME) — linked with icons right from the widget's About page.

---

## 🖥️ System Requirements

| Component | Minimum | Recommended |
| :--- | :--- | :--- |
| **OS** | Fedora 39+, Arch, Ubuntu 24.04+, openSUSE, Manjaro | Any modern Linux |
| **KDE Plasma** | Plasma 6.0+ (Qt 6.5+) | Plasma 6.5+ (Qt 6.7+) |
| **GNOME Shell** | GNOME Shell 46 | GNOME Shell 46–50 |
| **Dependencies** | `curl`, `glib-compile-schemas` | Pre-installed on modern distros |

---

## 🚀 Installation

### KDE Plasma 6 Plasmoid

```bash
git clone https://github.com/Mayanktaker/OpencodeGo-KDE-GNOME.git
cd OpencodeGo-KDE-GNOME
./install.sh
```

This automatically:
1. Installs/upgrades the plasmoid to `~/.local/share/plasma/plasmoids/`
2. Registers custom icons in `~/.local/share/icons/hicolor/`
3. Purges QML caches and restarts `plasmashell`
4. Links `opencode-usage` CLI to `~/.local/bin/`
5. Installs Bash tab completions

---

## 🐧 GNOME Shell Extension

The same usage tracker also ships as a GNOME Shell panel extension (UUID `opencodego-usage@mayanktaker.com`, GNOME Shell 46–50):

```bash
bash gnome-extension/install.sh
```

- Hover the panel icon to see Rolling (5h)/Weekly/Monthly usage; without credentials it shows demo data.
- The panel shows the weekly percentage next to the icon — orange at 75%, red at 90%. Switch it off in settings if you prefer icon only.
- The popup ends with **Open OpenCode Console** and **Settings…** — both stay available even when your sign-in has expired.
- The panel now shows the O✦ logo on GNOME too, not just on KDE.
- Open the extension's preferences (`gnome-extensions prefs opencodego-usage@mayanktaker.com`) and paste your Workspace ID + Auth Cookie to switch to live figures. **Test** checks your details without waiting for a refresh.
- On Wayland, the first install needs a logout/login: a running shell never picks up a newly installed extension. The installer queues it so it comes up enabled automatically.

### Installing on Manjaro / Arch

```bash
# 1. install (from a clone, or from the gnome-extension/ folder of a release bundle)
bash gnome-extension/install.sh

# 2. log out and back in  — required on Wayland, there is no rescan

# 3. confirm it is running
gnome-extensions info opencodego-usage@mayanktaker.com | grep -E 'State|Enabled'
journalctl --user -b | grep -i opencodego        # should be quiet

# 4. add your details
gnome-extensions prefs opencodego-usage@mayanktaker.com
```

Step 1 copies the extension into `~/.local/share/gnome-shell/extensions/opencodego-usage@mayanktaker.com`, compiles its gsettings schema, and queues it in dconf so it comes up enabled after the logout.

Getting the two values for step 4: open `https://opencode.ai/console/<your-workspace>/go` in the browser, then DevTools → Application → Cookies → opencode.ai → `__Host-console_session` for the cookie, and the `wrk_…` in the address bar for the workspace id. Paste them in and press **Test**.

Updating later: re-run `bash gnome-extension/install.sh` and log out/in again — a running shell keeps the old code.

To remove it:

```bash
gnome-extensions disable opencodego-usage@mayanktaker.com   # if the shell knows it
rm -rf ~/.local/share/gnome-shell/extensions/opencodego-usage@mayanktaker.com
dconf write /org/gnome/shell/enabled-extensions "['gnome-shell-extensions-appindicator@ubuntu.com']"  # keep your other extensions
```

---

## 📦 Download & Releases

Prefer a ready-made bundle? Grab the latest `.plasmoid` package, GNOME extension zip, or the shareable `.zip` (includes the installer + CLI) from the [GitHub Releases page](https://github.com/Mayanktaker/OpencodeGo-KDE-GNOME/releases). Install a downloaded `.plasmoid` with:

```bash
kpackagetool6 -t Plasma/Applet -i com.mayanktaker.opencodego-usage-v*.plasmoid
```

---

## 🔑 How to Get Your Workspace ID & Auth Cookie

1. Open the OpenCode Console Go page: `https://opencode.ai/console/wrk_XXXXXXXX/go` (sign in if prompted). Use the console — `/usage` is a separate cost dashboard, not the Go usage page.
2. Copy the workspace ID from the browser URL bar (it starts with `wrk_`, e.g. `wrk_01KE20AQRQ9QR7N15TWGJBE2V9`; `org_...` ids work too). It is sent in the `x-org-id` header on every request.
3. Press `F12` → **Application** → **Cookies** → `opencode.ai`.
4. Copy the **`__Host-console_session`** cookie value (a short opaque token, ~39 characters, e.g. `st_...`) — **not** `auth`. The old iron-session `auth=Fe26.2**` cookie no longer authenticates the console.
5. Right-click the widget → **Configure** → paste **Workspace ID** and the cookie value.
6. Click **Apply** or **OK**.
---

## 💻 CLI Usage

```bash
# Display formatted usage stats
opencode-usage

# Interactive setup wizard to test and save credentials for KDE & GNOME
opencode-usage --interactive   # or -i

# Output raw JSON
opencode-usage --json

# Export to CSV
opencode-usage --export /tmp/usage.csv

# Force demo mode
opencode-usage --demo

# Custom credentials
opencode-usage -w "wrk_01KE20AQRQ9QR7N15TWGJBE2V9" -c "__Host-console_session=st_..."
```

---

## 📁 Project Structure

```
OpencodeGo-KDE-GNOME/
├── metadata.json
├── contents/
│   ├── config/
│   │   ├── config.qml
│   │   └── main.xml
│   ├── ui/
│   │   ├── main.qml                 # Root PlasmoidItem, timer, data flow
│   │   ├── CompactRepresentation.qml # Panel tray badge
│   │   ├── FullRepresentation.qml   # Expanded popup
│   │   ├── UsageHeader.qml          # Title, refresh, full-bleed stripe
│   │   ├── HorizontalUsageBars.qml  # Progress bars + reset brackets
│   │   ├── UsageBarChart.qml        # Bar chart component
│   │   ├── UsageFetcher.qml         # curl transport via executable engine
│   │   ├── ViewSelector.qml         # (disabled) tab bar
│   │   ├── configGeneral.qml        # Settings: workspace, cookie, Test button
│   │   ├── configAppearance.qml     # Theme presets, toggles & color pickers
│   │   └── configAbout.qml          # Credits, GitHub repo & support
│   └── code/
│       └── api.js                   # Parsing, shell-quote, curl builder
├── bin/
│   ├── opencode-usage               # Python CLI client
│   ├── opencode-usage-completion.bash
│   └── opencode-usage-completion.zsh
├── gnome-extension/
│   ├── metadata.json                # Extension manifest (GNOME Shell 46–50)
│   ├── extension.js                 # Panel indicator, async curl transport, timer
│   ├── popup.js                     # Hover popup: header, 3 usage bars, footer
│   ├── settings.js                  # gsettings schema resolution + key names
│   ├── prefs.js                     # libadwaita preferences page
│   ├── api.js                       # GJS port of contents/code/api.js
│   ├── schemas/                     # gsettings schema (compiled on install)
│   ├── icons/                       # Branded O✦ logo (not yet wired to the panel)
│   ├── tests/                       # gjs test suites + runner
│   └── install.sh                   # Install, compile schema, enable or queue
├── assets/
│   ├── icon.svg
│   └── branding-icon.jpg
├── .github/
│   └── workflows/
│       └── release.yml              # CI: build + publish release bundles
├── install.sh
├── install-cli.sh
├── LICENSE
└── README.md
```

---

## 🏗️ Architecture Notes

- **Network Transport**: Qt's QML XHR silently strips the `Cookie` header (Qt `CookieLoadControlAttribute`), so `UsageFetcher.qml` shells out to `curl` via Plasma's `executable` dataengine. The cookie is shell-quoted before inlining.
- **Data Parsing**: `api.js` parses the console `go/status` JSON response (`access.meters.fiveHour` / `week` / `month`, BigInt money fields as strings), converting each meter into a percentage, reset countdown, and progress bar.
- **QML Bindings**: Child components must qualify parent properties with the parent's `id` (e.g., `fullRoot.usagePercent`) — unqualified names resolve to the child's own property, creating silent self-binding loops.

---

## ✨ What's New in v2.5.0

- **Now on GNOME Shell as well as KDE Plasma** — a panel icon that shows your Rolling (5h), Weekly, and Monthly usage on hover, with its own settings window.
- The GNOME panel icon now uses the same O✦ logo as the KDE widget, and shows your weekly percentage next to it (orange at 75%, red at 90%) — switch the badge off in settings if you prefer icon only.
- The GNOME popup has **Open OpenCode Console** and **Settings…** entries, and they still work when your sign-in has expired.
- GNOME settings include a **Test** button that checks your details straight away.
- The GNOME panel icon shows up reliably after a fresh install instead of silently not appearing.
- The GNOME settings window opens its contents properly.
- During a brief OpenCode outage, GNOME keeps your last known figures instead of replacing them with an error.
- The GNOME popup no longer duplicates itself after a refresh.
- GNOME no longer waits on the network in the background, so the desktop stays responsive while usage is checked.
- The download bundle now includes the GNOME extension, and builds always pick up the current version number.
- Full release notes live in [CHANGELOG.md](CHANGELOG.md).

---

## ⚠️ Known Issue: Brief "Temporarily Unavailable" Messages

OpenCode's usage page itself sometimes answers with a short outage (even in a browser). The widget retries automatically and keeps your last numbers on screen, then picks up fresh numbers on the next refresh — no action needed. If you see it often, you can report it to OpenCode with this template:

> Subject: `GET /console/api/go/status` returns intermittent HTTP 500
> Body: "While signed in, `GET https://opencode.ai/console/api/go/status` (with `x-org-id`) intermittently returns `500 {\"_tag\":\"InternalServerError\"}` — roughly 6 of 8 tries during one window — while `/console/api/orgs` stays 200. Seen on 2026-09-18. Please investigate."

## ⚖️ License & Copyright

© [Mayanktaker Computers & Web Development](https://mayanktaker.com) — Licensed under [MIT](LICENSE).
