import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from persona.export import export
from persona.store import add_messages, open_store

NOW = datetime(2026, 11, 28, 6, tzinfo=timezone.utc)


def m(i, chat, ts, text, sender="Riya"):
    return {"source": "whatsapp", "id": str(i), "chat": chat, "sender": sender, "ts": ts, "text": text, "from_me": 0}


class Export(unittest.TestCase):
    def test_writes_recent_messages_by_group_and_day_into_each_folder(self):
        with tempfile.TemporaryDirectory() as d:
            store = open_store(Path(d) / "p.sqlite")
            add_messages(store, [
                m(1, "AS1 OFFICIAL", "2026-11-20T04:30:00+00:00", "DAA FT-I on\n27 Jan"),
                m(2, "AS1 OFFICIAL", "2026-11-21T04:30:00+00:00", "", sender="Class Rep"),
                m(3, "AS1 unofficial", "2026-11-21T05:00:00+00:00", "lab tomorrow?"),
                m(4, "AS1 OFFICIAL", "2026-06-01T04:30:00+00:00", "too old"),
            ])
            folders = [Path(d) / "Sem3", Path(d) / "Sem4"]
            self.assertEqual(export(store, folders, NOW), "3 messages for Ask in 2 folders")
            text = (folders[1] / "_src" / "_persona" / "messages.md").read_text()
            store.close()
        self.assertIn("## AS1 OFFICIAL\n\n### Fri 20 Nov 2026\n- 10:00 Riya: DAA FT-I on 27 Jan", text)
        self.assertIn("- 10:00 Class Rep: (a file)", text)
        self.assertIn("## AS1 unofficial", text)
        self.assertNotIn("too old", text)


if __name__ == "__main__":
    unittest.main()
