#!/usr/bin/env bash
# © Mayanktaker Computers & Web Development | https://mayanktaker.com
# Packages the GNOME extension into a distribution-ready shell-extension.zip archive

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
UUID="opencodego-usage@mayanktaker.com"
VERSION="2.8.1"
ZIP_NAME="${UUID}-v${VERSION}.shell-extension.zip"
CANONICAL_ZIP="${UUID}.shell-extension.zip"

echo "Packaging OpenCode Go GNOME extension v${VERSION}..."

# Ensure gschemas are freshly compiled
glib-compile-schemas "${SCRIPT_DIR}/schemas"

# Prepare clean build folder
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}/package"

# Copy distribution files
cp "${SCRIPT_DIR}/metadata.json" "${BUILD_DIR}/package/"
cp "${SCRIPT_DIR}/extension.js" "${BUILD_DIR}/package/"
cp "${SCRIPT_DIR}/prefs.js" "${BUILD_DIR}/package/"
cp "${SCRIPT_DIR}/popup.js" "${BUILD_DIR}/package/"
cp "${SCRIPT_DIR}/settings.js" "${BUILD_DIR}/package/"
cp "${SCRIPT_DIR}/api.js" "${BUILD_DIR}/package/"
cp "${SCRIPT_DIR}/stylesheet.css" "${BUILD_DIR}/package/"

# Copy schemas (EGO requires XML source only, gschemas.compiled is generated on client)
mkdir -p "${BUILD_DIR}/package/schemas"
cp "${SCRIPT_DIR}/schemas/org.gnome.shell.extensions.opencodego-usage.gschema.xml" "${BUILD_DIR}/package/schemas/"

# Copy icons
mkdir -p "${BUILD_DIR}/package/icons"
cp "${SCRIPT_DIR}/icons/"*.svg "${BUILD_DIR}/package/icons/"

# Create zip from inside package folder (EGO requires files at root of zip)
cd "${BUILD_DIR}/package"
if command -v zip >/dev/null 2>&1; then
    zip -qr "${BUILD_DIR}/${ZIP_NAME}" .
else
    python3 -c '
import os, sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk("."):
        for f in sorted(files):
            p = os.path.join(root, f)
            zf.write(p, os.path.relpath(p, "."))
' "${BUILD_DIR}/${ZIP_NAME}"
fi
cp "${BUILD_DIR}/${ZIP_NAME}" "${BUILD_DIR}/${CANONICAL_ZIP}"

echo "✅ Created package: ${BUILD_DIR}/${ZIP_NAME}"
echo "✅ Created canonical: ${BUILD_DIR}/${CANONICAL_ZIP}"
ls -lh "${BUILD_DIR}/${ZIP_NAME}"

# Generate SHA256 checksums
cd "${BUILD_DIR}"
sha256sum "${ZIP_NAME}" "${CANONICAL_ZIP}" > "${BUILD_DIR}/SHA256SUMS"
echo "✅ Generated SHA256 checksums in ${BUILD_DIR}/SHA256SUMS:"
cat "${BUILD_DIR}/SHA256SUMS"
