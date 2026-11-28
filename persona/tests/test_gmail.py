import re
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from persona.gmail import classify, collect
from persona.store import open_store

NOW = datetime(2026, 11, 28, 6, tzinfo=timezone.utc)

MAILS = {
    3: ("Mercor <team@mercor.com>", "Your assessment invite: Code Review", "Fri, 27 Nov 2026 10:00:00 +0000"),
    4: ("GitHub <notifications@github.com>", "[KunalShukla-Al/Acadkit] Run failed: CI", "Fri, 27 Nov 2026 11:00:00 +0000"),
    5: ("Amazon <ship@amazon.in>", "Your order has shipped", "Fri, 27 Nov 2026 12:00:00 +0000"),
    6: ("LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>", "=?utf-8?q?ML_intern_=E2=80=94_Bengaluru?=", "Sat, 28 Nov 2026 01:00:00 +0000"),
}


class FakeImap:
    """Just enough of imaplib.IMAP4 for the collector: search and header fetch by UID."""

    def __init__(self, mails, validity=b"42"):
        self.mails, self.validity, self.searches, self.out = mails, validity, [], False
        self.fresh = validity

    def login(self, user, password):
        assert password == "app-pass"

    def select(self, box, readonly):
        assert readonly
        self.validity = self.fresh

    def response(self, code):
        # Like imaplib: the untagged reply is handed over once.
        given, self.validity = self.validity, None
        return code, [given]

    def uid(self, command, *args):
        if command == "search":
            self.searches.append(args[1])
            m = re.match(r"UID (\d+):\*", args[1])
            low = int(m.group(1)) if m else 0
            return "OK", [" ".join(str(u) for u in sorted(self.mails) if u >= low).encode()]
        data = []
        for u in map(int, args[0].split(",")):
            frm, subj, date = self.mails[u]
            data += [(f"{u} (UID {u} BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {{99}}".encode(),
                      f"From: {frm}\r\nSubject: {subj}\r\nDate: {date}\r\n\r\n".encode()), b")"]
        return "OK", data

    def logout(self):
        self.out = True


class Gmail(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.store = open_store(Path(self.dir.name) / "persona.sqlite")

    def tearDown(self):
        self.store.close()
        self.dir.cleanup()

    def signals(self):
        return [dict(r) for r in self.store.execute("SELECT kind, title, who FROM signals ORDER BY at")]

    def test_sorts_senders_by_domain(self):
        self.assertEqual([classify(x) for x in ("team@mercor.com", "a@mail.mercor.io", "x <noreply@github.com>",
                                                "jobs@internshala.com", "no@coursera.org", "me@gmail.com", "x@notgithub.com")],
                         ["mercor", "mercor", "github", "job", "course", None, None])

    def test_keeps_known_senders_subjects_only_and_moves_the_cursor(self):
        imap = FakeImap(dict(MAILS))
        note = collect(self.store, ["Me@gmail.com"], connect=lambda: imap, password=lambda a: "app-pass", now=NOW)
        self.assertEqual(note, "3 new signals from 1 account")
        self.assertEqual([s["kind"] for s in self.signals()], ["mercor", "github", "job"])
        self.assertEqual(self.signals()[2]["title"], "ML intern — Bengaluru")
        self.assertEqual(self.signals()[0]["who"], "Mercor")
        self.assertTrue(imap.out)
        self.assertTrue(imap.searches[0].startswith("SINCE 14-Nov-2026"))
        imap.mails[7] = ("Mercor <team@mercor.com>", "Payment sent", "Sat, 28 Nov 2026 05:00:00 +0000")
        self.assertEqual(collect(self.store, ["me@gmail.com"], connect=lambda: imap, password=lambda a: "app-pass", now=NOW),
                         "1 new signal from 1 account")
        self.assertEqual(imap.searches[-1], "UID 7:*")

    def test_one_failing_account_is_noted_and_all_failing_raises(self):
        def password(a):
            if a == "b@gmail.com":
                raise LookupError("no app password for b@gmail.com in Keychain (service acadkit.gmail)")
            return "app-pass"
        note = collect(self.store, ["a@gmail.com", "b@gmail.com"], connect=lambda: FakeImap(dict(MAILS)), password=password, now=NOW)
        self.assertEqual(note, "3 new signals from 1 account; b@gmail.com: no app password for b@gmail.com in Keychain (service acadkit.gmail)")
        with self.assertRaises(RuntimeError):
            collect(self.store, ["b@gmail.com"], connect=lambda: FakeImap({}), password=password, now=NOW)

    def test_no_accounts_says_how_to_add_one(self):
        self.assertIn("persona.gmail add", collect(self.store, []))


if __name__ == "__main__":
    unittest.main()
