#!/usr/bin/env python3
# © Mayanktaker Computers & Web Development | https://mayanktaker.com
# Stub console API for transport tests. The mode is read from a file on every
# request, so a scenario can change the server's behaviour without a restart.
#   ./stub-server.py PORT MODE_FILE HITS_FILE
#   good    -> HTTP 200 with a realistic go/status payload
#   flap    -> one good response, then 500 forever (transient outage)
#   slow    -> one good response after a fixed delay (keeps the resume snapshot visible)
#   500     -> HTTP 500 on every request
#   404     -> HTTP 404 on every request (route moved)
#   401     -> HTTP 401 {"_tag":"Unauthorized"} (dead session)
import http.server
import json
import sys
import time

MODE_FILE = sys.argv[2] if len(sys.argv) > 2 else "/tmp/opencodego-stub.mode"
HITS_FILE = sys.argv[3] if len(sys.argv) > 3 else "/tmp/opencodego-stub.hits"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899

# Realistic payload: three meters, BigInt money fields as strings, month has no resetsAt
GOOD_BODY = json.dumps({
    "product": "go",
    "access": {
        "startsAt": "2026-09-18T10:24:13.000Z",
        "endsAt": "2026-10-18T10:24:13.000Z",
        "meters": {
            "fiveHour": {"usedMicroCents": "300000000", "limitMicroCents": "1200000000",
                         "resetsAt": "2026-09-28T02:00:00.000Z"},
            "week": {"usedMicroCents": "480000000", "limitMicroCents": "2000000000",
                     "resetsAt": "2026-10-01T00:00:00.000Z"},
            "month": {"usedMicroCents": "6800000000", "limitMicroCents": "20000000000"},
        },
    },
}).encode()

STATUS_FOR_MODE = {
    "500": 500,
    "404": 404,
    "401": 401,
    "good": 200,
    "flap": 200,
    "slow": 200,
}
BODY_FOR_MODE = {
    "500": b'{"_tag":"InternalServerError"}',
    "404": b"",
    "401": b'{"_tag":"Unauthorized"}',
}


def current_mode():
    try:
        with open(MODE_FILE) as handle:
            return handle.read().strip()
    except OSError:
        return "500"


class Handler(http.server.BaseHTTPRequestHandler):
    # Seconds of artificial latency for the "slow" mode
    SLOW_DELAY_SEC = 8

    def do_GET(self):
        mode = current_mode()
        # "flap" serves one good payload and then turns into a 5xx storm
        if mode == "flap":
            with open(HITS_FILE) as handle:
                served = sum(1 for line in handle if " flap " in line)
            mode = "good" if served <= 1 else "500"
        # "slow" holds the connection open so the pre-fetch resume state is observable
        if mode == "slow":
            time.sleep(self.SLOW_DELAY_SEC)

        with open(HITS_FILE, "a") as handle:
            handle.write(f"{time.time():.1f} {current_mode()} {self.path}\n")

        status = STATUS_FOR_MODE.get(mode, 200)
        body = BODY_FOR_MODE.get(mode, GOOD_BODY)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    # Threaded so a delayed "slow" response never blocks unrelated concurrent
    # requests (the rig shell, prefs Test Connection) behind one connection
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
