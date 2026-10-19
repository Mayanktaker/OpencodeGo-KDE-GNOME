#!/usr/bin/env bash
# © Mayanktaker Computers & Web Development | https://mayanktaker.com
# Verifies the integrity of a published GitHub release.
#
#   tools/verify-release.sh                 # latest release
#   tools/verify-release.sh v2.8.1          # a specific tag
#   tools/verify-release.sh v2.8.1 my/repo  # a specific tag of another repo
#
# Downloads every release asset into a temporary folder and runs
# `sha256sum -c SHA256SUMS` on it, so a flat download really is verified.
set -uo pipefail

TAG="${1:-}"
REPO="${2:-Mayanktaker/OpencodeGo-KDE-GNOME}"

if ! command -v gh >/dev/null 2>&1; then
    echo "verify-release: the GitHub CLI (gh) is required" >&2
    exit 2
fi
if ! command -v sha256sum >/dev/null 2>&1; then
    echo "verify-release: sha256sum is required" >&2
    exit 2
fi

if [ -z "$TAG" ]; then
    TAG="$(gh release view --repo "$REPO" --json tagName --jq .tagName 2>/dev/null)"
    [ -n "$TAG" ] || { echo "verify-release: could not resolve the latest release" >&2; exit 2; }
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "verify-release: downloading ${TAG} from ${REPO}..."
gh release download "$TAG" --repo "$REPO" --dir "$WORKDIR" || {
    echo "verify-release: download failed" >&2
    exit 1
}

if [ ! -f "$WORKDIR/SHA256SUMS" ]; then
    echo "verify-release: ${TAG} has no SHA256SUMS asset" >&2
    exit 1
fi

# A checksum file that lists repo-relative paths cannot be verified in a flat
# download folder, so point that out instead of failing with a confusing error
if grep -q '/' "$WORKDIR/SHA256SUMS"; then
    echo "verify-release: note — ${TAG} lists repo-relative paths in SHA256SUMS," >&2
    echo "verify-release:        which cannot be checked in a flat download folder" >&2
fi

echo "verify-release: checking checksums..."
if (cd "$WORKDIR" && sha256sum -c SHA256SUMS); then
    echo "verify-release: OK — every asset in ${TAG} matches its published checksum"
else
    echo "verify-release: FAILED — checksum mismatch or missing asset in ${TAG}" >&2
    exit 1
fi
