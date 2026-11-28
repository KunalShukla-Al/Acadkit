import json
import sqlite3
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from persona.pack import watched_groups
from persona.store import open_store
from persona.tests import fixtures
from persona.whatsapp import SCHEMA_SQL, SchemaChanged, check, collect, columns_of, ingest, plan

NOW = datetime(2026, 11, 28, 12, tzinfo=timezone.utc)
GROUPS = ["AS1 OFFICIAL", "as1 UNOFFICIAL"]


def read_only(path):
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


class Collector(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.db = str(Path(self.dir.name) / "ChatStorage.sqlite")
        fixtures.build(self.db)
        self.store = open_store(Path(self.dir.name) / "persona.sqlite")

    def tearDown(self):
        self.store.close()
        self.dir.cleanup()

    def run_once(self, groups=GROUPS, days=60):
        live = read_only(self.db)
        try:
            return collect(live, self.store, groups, NOW, days)
        finally:
            live.close()

    def messages(self):
        return [dict(r) for r in self.store.execute("SELECT * FROM messages ORDER BY CAST(id AS INTEGER)")]

    def test_reads_only_watched_groups_matching_names_loosely(self):
        self.assertEqual(self.run_once(), "4 new messages from 2 groups")
        self.assertEqual({m["chat"] for m in self.messages()}, {"AS1 OFFICIAL", "as1 UNOFFICIAL"})
        self.assertNotIn("dinner at 9", [m["text"] for m in self.messages()])

    def test_first_run_reads_back_only_the_given_days(self):
        self.run_once()
        self.assertNotIn("an old message from July", [m["text"] for m in self.messages()])
        self.run_once(groups=["AS1 OFFICIAL"], days=200)
        self.assertNotIn("an old message from July", [m["text"] for m in self.messages()])

    def test_keeps_files_drops_empty_rows_and_names_senders(self):
        self.run_once()
        by_id = {m["id"]: m for m in self.messages()}
        self.assertEqual(by_id["102"]["media_path"], "Media/AS1/notice.pdf")
        self.assertNotIn("104", by_id)
        self.assertEqual(by_id["100"]["sender"], "Faculty A")
        self.assertEqual(by_id["100"]["sender_id"], "fa@s.whatsapp.net")
        self.assertEqual(by_id["101"]["sender"], "mate")
        self.assertEqual(by_id["103"]["sender"], "me")
        self.assertEqual(by_id["100"]["ts"], "2026-10-13T04:30:00+00:00")

    def test_later_runs_add_only_what_is_new(self):
        self.run_once()
        self.assertEqual(self.run_once(), "0 new messages from 2 groups")
        fixtures.add(self.db, 200, 1, "2026-11-28T09:00:00", "Lab record due Monday.")
        self.assertEqual(self.run_once(), "1 new message from 2 groups")

    def test_a_group_added_later_is_read_back(self):
        self.run_once(groups=["AS1 OFFICIAL"])
        self.assertEqual(self.run_once(groups=["AS1 OFFICIAL", "AS1 unofficial"]), "1 new message from 2 groups")

    def test_says_which_names_match_no_chat(self):
        self.assertEqual(self.run_once(groups=["AS1 OFFICIAL", "AS2"]), "3 new messages from 1 group; no chat named AS2")
        self.assertIn("no groups to watch", self.run_once(groups=[]))

    def test_names_with_quotes_stay_literal(self):
        self.assertEqual(self.run_once(groups=["it's a trap' OR 1=1 --"]), "0 new messages from 0 groups; no chat named it's a trap' OR 1=1 --")

    def test_the_plan_runs_through_apples_sqlite3_as_the_agent_does(self):
        sqlite = Path("/usr/bin/sqlite3")
        if not sqlite.exists():
            self.skipTest("no /usr/bin/sqlite3 here")
        run = lambda sql: json.loads(subprocess.run([str(sqlite), "-readonly", "-json", self.db], input=sql, capture_output=True, text=True, check=True).stdout or "[]")  # noqa: E731
        sql = plan(columns_of(run(SCHEMA_SQL)), self.store, GROUPS, NOW)
        self.assertEqual(ingest(run(sql), self.store, GROUPS), "4 new messages from 2 groups")


class Schema(unittest.TestCase):
    def test_works_without_the_optional_tables(self):
        with tempfile.TemporaryDirectory() as d:
            db = str(Path(d) / "c.sqlite")
            fixtures.build(db, members=False, media=False)
            store = open_store(Path(d) / "p.sqlite")
            self.assertEqual(collect(read_only(db), store, ["AS1 OFFICIAL"], NOW), "2 new messages from 1 group")
            store.close()

    def test_a_missing_required_column_stops_the_run_and_names_it(self):
        found = {"ZWAMESSAGE": {"Z_PK", "ZCHATSESSION", "ZMESSAGEDATE", "ZISFROMME"}, "ZWACHATSESSION": {"Z_PK", "ZPARTNERNAME"}}
        with self.assertRaisesRegex(SchemaChanged, "ZWAMESSAGE.ZTEXT"):
            check(found)

    def test_reads_columns_from_the_schema_query(self):
        self.assertEqual(columns_of([{"t": "ZWAMESSAGE", "c": "ZTEXT"}, {"t": "ZWAMESSAGE", "c": "Z_PK"}]), {"ZWAMESSAGE": {"ZTEXT", "Z_PK"}})


class Pack(unittest.TestCase):
    def test_groups_come_from_the_pack_unless_the_env_names_them(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "_src").mkdir()
            (Path(d) / "_src" / "semester.json").write_text(json.dumps({"version": 1, "whatsapp": {"groups": ["AS1 OFFICIAL"]}}))
            self.assertEqual(watched_groups({"STUDY_DIR": d}), ["AS1 OFFICIAL"])
            self.assertEqual(watched_groups({"STUDY_DIR": d, "PERSONA_WHATSAPP_GROUPS": "A, B ,"}), ["A", "B"])
            self.assertEqual(watched_groups({"STUDY_DIR": str(Path(d) / "none")}), [])


if __name__ == "__main__":
    unittest.main()
