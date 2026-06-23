#!/usr/bin/python3
"""Native-messaging host that wakes the Worklish backend on demand.

Chrome launches this when the extension detects a YouTube watch page. It reads
the trigger message (content ignored), kickstarts the backend launchd job --
a no-op if it's already running -- and replies so Chrome's callback resolves
cleanly. Uses /usr/bin/python3 (always present, stdlib only) because Chrome
launches native hosts with a minimal PATH.
"""
import json
import os
import struct
import subprocess
import sys

LAUNCHCTL = "/bin/launchctl"
LABEL = "com.worklish.backend"


def _read_message():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) < 4:
        return None
    (length,) = struct.unpack("<I", raw_len)
    return json.loads(sys.stdin.buffer.read(length).decode("utf-8"))


def _send_message(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def main():
    _read_message()  # consume Chrome's trigger; its content is not used
    target = "gui/{}/{}".format(os.getuid(), LABEL)
    try:
        proc = subprocess.run(
            [LAUNCHCTL, "kickstart", target],
            capture_output=True, text=True, timeout=10,
        )
        _send_message({
            "ok": proc.returncode == 0,
            "code": proc.returncode,
            "stderr": proc.stderr.strip(),
        })
    except Exception as e:  # report any failure back to the extension console
        _send_message({"ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
