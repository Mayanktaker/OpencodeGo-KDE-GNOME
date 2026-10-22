#!/usr/bin/env bash
# © Mayanktaker Computers & Web Development | https://mayanktaker.com
# Builds and validates the GNOME Shell extension bundle for submission to
# extensions.gnome.org, then prints the exact file to upload.
#
#   tools/ego-submit.sh
#
# Do NOT use `gnome-extensions pack` for the upload: it only bundles
# metadata.json, extension.js, prefs.js, stylesheet.css and the schema, so
# api.js, settings.js, popup.js and icons/ would be missing and the published
# extension would fail at runtime. This script uses gnome-extension/package.sh,
# which copies the full runtime.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$ROOT/gnome-extension"
UUID="opencodego-usage@mayanktaker.com"
BUNDLE="$EXT_DIR/build/${UUID}.shell-extension.zip"
EGO_UPLOAD_URL="https://extensions.gnome.org/upload/"

# Files the extension cannot run without
REQUIRED=(
    "metadata.json"
    "extension.js"
    "prefs.js"
    "popup.js"
    "settings.js"
    "api.js"
    "history.js"
    "version.js"
    "stylesheet.css"
    "icons/opencodego-symbolic.svg"
    "icons/opencodego-brand.svg"
    "schemas/org.gnome.shell.extensions.opencodego-usage.gschema.xml"
)

# Paths EGO rejects or that must never be shipped
FORBIDDEN=("gschemas.compiled" "tests/" "build/" "__pycache__")

echo "ego-submit: building the extension bundle..."
bash "$EXT_DIR/package.sh" >/dev/null || {
    echo "ego-submit: packaging failed" >&2
    exit 1
}

[ -f "$BUNDLE" ] || {
    echo "ego-submit: expected bundle not found at ${BUNDLE}" >&2
    exit 1
}

echo "ego-submit: validating bundle contents..."
CONTENTS="$(python3 - "$BUNDLE" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    for name in z.namelist():
        print(name)
PY
)"

status=0
for required in "${REQUIRED[@]}"; do
    if ! printf '%s\n' "$CONTENTS" | grep -qxF "$required"; then
        echo "ego-submit: MISSING required file: $required" >&2
        status=1
    fi
done
for forbidden in "${FORBIDDEN[@]}"; do
    if printf '%s\n' "$CONTENTS" | grep -qF "$forbidden"; then
        echo "ego-submit: FORBIDDEN content present: $forbidden" >&2
        status=1
    fi
done

if [ "$status" -ne 0 ]; then
    echo "ego-submit: bundle is not uploadable — fix the errors above" >&2
    exit 1
fi

VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
SIZE="$(du -h "$BUNDLE" | cut -f1)"

cat <<EOF

ego-submit: bundle is ready for extensions.gnome.org

  File to upload : ${BUNDLE}
  Size           : ${SIZE}
  Version        : ${VERSION}
  UUID           : ${UUID}
  Upload page    : ${EGO_UPLOAD_URL}

  Steps
  1. Sign in at https://extensions.gnome.org/ with your GNOME account.
  2. Open ${EGO_UPLOAD_URL}
  3. Upload the file listed above.
  4. Fill in the listing: title, description, and the source repository URL
     https://github.com/Mayanktaker/OpencodeGo-KDE-GNOME
  5. Submit. A human reviewer approves new listings, so the INCOMPATIBLE
     badge stays until then — that is expected, not an error.

EOF
