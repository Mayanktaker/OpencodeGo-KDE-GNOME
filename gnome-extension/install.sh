#!/usr/bin/env bash
# © Mayanktaker Computers & Web Development | https://mayanktaker.com
# Installs the GNOME Shell extension into the user extension directory and enables it
set -euo pipefail

# Extension identity must match metadata.json
UUID="opencodego-usage@mayanktaker.com"
# Pre-EGO uuid (no `@` namespace) — cleaned up below so installs do not pile up
LEGACY_UUID="com.mayanktaker.opencodego-usage"
# Install target inside the user's home
EXT_ROOT="$HOME/.local/share/gnome-shell/extensions"
DEST="$EXT_ROOT/$UUID"
# This script's directory (the repo's gnome-extension folder)
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Retire the pre-EGO install: unqueue it, then drop the stale folder
LEGACY_DIR="$EXT_ROOT/$LEGACY_UUID"
if [ -d "$LEGACY_DIR" ]; then
    gnome-extensions disable "$LEGACY_UUID" >/dev/null 2>&1 || true
    LEGACY_LISTED="$(dconf read /org/gnome/shell/enabled-extensions 2>/dev/null || true)"
    case "$LEGACY_LISTED" in
        *"$LEGACY_UUID"*)
            # Match the quoted entry and escape dots so only this uuid is stripped
            QUOTED_ESC="'${LEGACY_UUID//./\\.}'"
            WITHOUT_LEGACY="${LEGACY_LISTED//$QUOTED_ESC, }"
            WITHOUT_LEGACY="${WITHOUT_LEGACY//, $QUOTED_ESC}"
            WITHOUT_LEGACY="${WITHOUT_LEGACY//$QUOTED_ESC}"
            dconf write /org/gnome/shell/enabled-extensions "$WITHOUT_LEGACY"
            ;;
    esac
    rm -rf -- "$LEGACY_DIR"
    echo "Removed legacy install $LEGACY_UUID (replaced by $UUID)."
fi

# Copy extension files except dev-only artifacts, packaged builds, and this script
# (--delete-excluded also drops leftovers such as build/ from previous installs)
mkdir -p "$DEST"
rsync -a --delete --delete-excluded --exclude 'install.sh' --exclude 'tests' --exclude 'build' --exclude '.git' "$SRC/" "$DEST/"

# Compile the gsettings schema into the installed copy
glib-compile-schemas "$DEST/schemas/"

# Cycle disable -> enable when the running shell already knows the extension so stylesheet.css reloads live
gnome-extensions disable "$UUID" 2>/dev/null || true
if gnome-extensions enable "$UUID" 2>/dev/null; then
    echo "Enabled $UUID in the running shell (cycled disable/enable to reload styles)."
else
    # A shell that started before this install has never seen the directory, and
    # GNOME offers no rescan: queue the extension in dconf so it comes up enabled.
    CURRENT="$(dconf read /org/gnome/shell/enabled-extensions 2>/dev/null || true)"
    case "$CURRENT" in
        *"$UUID"*) ;;
        *)
            if [ -z "$CURRENT" ] || [ "$CURRENT" = "@a[]" ]; then
                dconf write /org/gnome/shell/enabled-extensions "['$UUID']"
            else
                # Append to the existing string array: drop the closing `]`, add our entry, re-close
                UPDATED="${CURRENT%\]}, '$UUID']"
                dconf write /org/gnome/shell/enabled-extensions "$UPDATED"
            fi
            ;;
    esac
    echo "Queued $UUID for next login (the running shell cannot pick up new extensions)."
fi

echo "Installed $UUID -> $DEST"
echo "Log out and back in, then: hover the panel icon. Settings: gnome-extensions prefs $UUID"
