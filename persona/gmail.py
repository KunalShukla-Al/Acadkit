"""The Gmail collector: mail from senders that matter (Mercor, GitHub, job boards, courses), as signals.

Accounts are listed in persona/config.json ("gmail": [addresses]); each one's
app password sits in Keychain under the service acadkit.gmail, read with
Apple's `security`. It reads headers only, sender and subject, over IMAP,
read-only, and keeps a signal for each mail from a known sender. Bodies are
never fetched.

    python3 -m persona.gmail collect          one run (the orchestrator's `gmail` job)
    python3 -m persona.gmail add <address>    list an account; prints the Keychain command to run
"""

from __future__ import annotations

import argparse
import email.utils
import imaplib
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.parser import BytesHeaderParser

from .signals import write_recent
from .store import add_signals, get_cursor, load_config, open_store, save_config, set_cursor

SERVICE = "acadkit.gmail"
FIRST_DAYS = 14

# Sender domains, first match wins.
RULES = (
    ("mercor", re.compile(r"(^|\.)mercor\.(com|io)$")),
    ("github", re.compile(r"(^|\.)github\.com$")),
    ("job", re.compile(r"(^|\.)(linkedin\.com|internshala\.com|naukri\.com|wellfound\.com|unstop\.com|instahyre\.com)$")),
    ("course", re.compile(r"(^|\.)(coursera\.org|deeplearning\.ai|nptel\.ac\.in)$")),
)


def classify(sender: str) -> str | None:
    domain = email.utils.parseaddr(sender)[1].rpartition("@")[2].lower()
    for kind, rule in RULES:
        if rule.search(domain):
            return kind
    return None


def keychain_password(address: str) -> str:
    r = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", SERVICE, "-a", address, "-w"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise LookupError(f"no app password for {address} in Keychain (service {SERVICE})")
    return r.stdout.strip()


def _text(value: str | None) -> str:
    return str(make_header(decode_header(value or ""))).strip()


def fetch(imap, address: str, password: str, after_uid: int, since: datetime) -> tuple[str, list[dict]]:
    """(UIDVALIDITY, headers of new mail) from the inbox, opened read-only."""

    imap.login(address, password)
    try:
        imap.select("INBOX", readonly=True)
        # response() hands over the untagged reply once; a second call gets [None].
        raw = (imap.response("UIDVALIDITY")[1] or [None])[0]
        validity = raw.decode() if isinstance(raw, bytes) else ""
        query = f"UID {after_uid + 1}:*" if after_uid else f'SINCE {since.strftime("%d-%b-%Y")}'
        _, found = imap.uid("search", None, query)
        uids = [int(u) for u in (found[0] or b"").split() if int(u) > after_uid]
        out = []
        if uids:
            _, data = imap.uid("fetch", ",".join(map(str, uids)), "(UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
            for part in data:
                if not isinstance(part, tuple):
                    continue
                uid = int(re.search(rb"UID (\d+)", part[0]).group(1))
                h = BytesHeaderParser().parsebytes(part[1])
                out.append({"uid": uid, "from": _text(h.get("From")), "subject": _text(h.get("Subject")), "date": h.get("Date")})
        return validity, out
    finally:
        imap.logout()


def _iso(date_header: str | None) -> str:
    try:
        return email.utils.parsedate_to_datetime(date_header).astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        return datetime.now(timezone.utc).isoformat()


def collect(store, accounts: list[str], connect=lambda: imaplib.IMAP4_SSL("imap.gmail.com"),
            password=keychain_password, now: datetime | None = None) -> str:
    if not accounts:
        return "no Gmail accounts: python3 -m persona.gmail add <address>"
    now = now or datetime.now(timezone.utc)
    kept, failed = 0, []
    for address in accounts:
        key = f"gmail:{address.lower()}"
        saved = (get_cursor(store, key) or ":0").split(":")
        try:
            validity, mails = fetch(connect(), address, password(address), int(saved[1]), now - timedelta(days=FIRST_DAYS))
        except (LookupError, imaplib.IMAP4.error, OSError) as err:
            failed.append(f"{address}: {err}")
            continue
        if validity and saved[0] and validity != saved[0]:
            validity, mails = fetch(connect(), address, password(address), 0, now - timedelta(days=FIRST_DAYS))
        rows = [
            {"source": "gmail", "id": f"{address.lower()}:{validity}:{m['uid']}", "kind": kind,
             "title": m["subject"][:200], "who": email.utils.parseaddr(m["from"])[0] or m["from"], "at": _iso(m["date"])}
            for m in mails
            if (kind := classify(m["from"]))
        ]
        kept += add_signals(store, rows)
        if mails:
            set_cursor(store, key, f"{validity}:{max(m['uid'] for m in mails)}")
    store.commit()
    note = f"{kept} new signal{'' if kept == 1 else 's'} from {len(accounts) - len(failed)} account{'' if len(accounts) - len(failed) == 1 else 's'}"
    if failed:
        if len(failed) == len(accounts):
            raise RuntimeError("; ".join(failed))
        note += "; " + "; ".join(failed)
    return note


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m persona.gmail")
    parser.add_argument("command", choices=["collect", "add"])
    parser.add_argument("address", nargs="?")
    args = parser.parse_args(argv)
    config = load_config()
    if args.command == "add":
        if not args.address or "@" not in args.address:
            print("give the address: python3 -m persona.gmail add me@gmail.com", file=sys.stderr)
            return 1
        config["gmail"] = sorted(set(config.get("gmail", [])) | {args.address.lower()})
        save_config(config)
        print(f"Listed {args.address}. Now store its app password (myaccount.google.com/apppasswords):")
        print(f"  security add-generic-password -s {SERVICE} -a {args.address.lower()} -w")
        return 0
    store = open_store()
    try:
        note = collect(store, config.get("gmail", []))
    except RuntimeError as err:
        print(str(err), file=sys.stderr)
        return 1
    write_recent(store)
    print(note)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
