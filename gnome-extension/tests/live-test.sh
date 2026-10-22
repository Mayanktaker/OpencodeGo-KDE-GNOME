#!/usr/bin/env bash
# © Mayanktaker Computers & Web Development | https://mayanktaker.com
# Headless GNOME Shell rig: boots a private session bus plus a headless shell so the
# extension's real runtime can be exercised without logging out of a live desktop.
#
#   ./live-test.sh up        # boot the rig
#   ./live-test.sh shell CMD # run CMD against the rig's session bus
#   ./live-test.sh down      # tear the rig down
#
# GNOME 50 removed --nested, and --wayland now means display-server only, so a
# headless server with a virtual monitor is the way to get a second shell.
set -uo pipefail

RIG_DIR="${RIG_DIR:-${TMPDIR:-/tmp}/opencodego-rig}"
UUID="opencodego-usage@mayanktaker.com"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/gnome-shell/extensions/$UUID}"
VIRTUAL_MONITOR="${VIRTUAL_MONITOR:-1400x900}"

alive() { [ -f "$RIG_DIR/shell.pid" ] && kill -0 "$(cat "$RIG_DIR/shell.pid")" 2>/dev/null; }

# Kills the rig shell and any orphan left behind by an interrupted run. An orphan
# keeps its Gio.Settings alive and will happily overwrite a later scenario's
# values, which looks exactly like a flaky test.
kill_shells() {
    local pid
    [ -f "$RIG_DIR/shell.pid" ] && pid="$(cat "$RIG_DIR/shell.pid")"
    if [ -n "${pid:-}" ]; then
        kill "$pid" 2>/dev/null
        # give it a moment to unwind before resorting to the sweep
        for _ in 1 2 3 4 5; do
            kill -0 "$pid" 2>/dev/null || break
            sleep 1
        done
    fi
    pkill -f 'gnome-shell --headless --virtual-monitor' 2>/dev/null
    sleep 1
    rm -f "$RIG_DIR/shell.pid" "$RIG_DIR/bus.pid" "$RIG_DIR/bus.addr"
}

down() {
    kill_shells
    [ -f "$RIG_DIR/bus.pid" ] && kill "$(cat "$RIG_DIR/bus.pid")" 2>/dev/null
    rm -f "$RIG_DIR/bus.pid" "$RIG_DIR/bus.addr"
    echo "rig down"
}

up() {
    mkdir -p "$RIG_DIR"
    # A private bus keeps the rig off the live desktop's session entirely
    dbus-daemon --session --print-address=3 --fork 3> "$RIG_DIR/bus.addr"
    export DBUS_SESSION_BUS_ADDRESS="$(cat "$RIG_DIR/bus.addr")"
    # The rig also gets its own scratch cache: real history samples from the
    # desktop must not leak into scenarios, and scenarios must not write to home
    export OPENCODEGO_CACHE_DIR="$RIG_DIR/cache"
    MUTTER_DEBUG_DUMMY_MODE_SPECS="$VIRTUAL_MONITOR" nohup \
        gnome-shell --headless --virtual-monitor="$VIRTUAL_MONITOR" > "$RIG_DIR/shell.log" 2>&1 &
    echo $! > "$RIG_DIR/shell.pid"
    # The shell needs a moment before the extension system answers
    for _ in $(seq 1 40); do
        gnome-extensions info "$UUID" > /dev/null 2>&1 && break
        sleep 1
    done
    echo "rig up: dbus=${DBUS_SESSION_BUS_ADDRESS} log=${RIG_DIR}/shell.log"
}

# greps the rig journal, dropping the third-party extension noise a headless run
# produces as well as the test probe's own JSON (which contains an "error" field)
errors() {
    grep -E "CRITICAL|Error|error" "$RIG_DIR/shell.log" 2>/dev/null \
        | grep -iE "opencodego|$UUID" \
        | grep -vE "Clutter-WARNING|St-CRITICAL|GLib-GObject-CRITICAL|PROBE " | tail -"${1:-20}"
}

case "${1:-}" in
    up) up ;;
    down) down ;;
    alive) alive && echo up || echo down ;;
    shell) shift; DBUS_SESSION_BUS_ADDRESS="$(cat "$RIG_DIR/bus.addr")" "$@" ;;
    log) grep -vE "Clutter-WARNING|St-CRITICAL|xdg-desktop-portal|fusermount|GLib-GObject-CRITICAL" "$RIG_DIR/shell.log" | tail -"${2:-40}" ;;
    errors) shift; errors "${1:-20}" ;;
    *) echo "usage: $0 {up|down|alive|shell CMD|log N|errors N}" >&2; exit 2 ;;
esac
