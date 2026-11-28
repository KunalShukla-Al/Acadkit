import json
import unittest
from datetime import datetime, timezone

from persona.github import snapshot

NOW = datetime(2026, 11, 28, 6, tzinfo=timezone.utc)


def fake(args):
    if args[:2] == ["search", "prs"]:
        return json.dumps([
            {"number": 86, "title": "calendar", "url": "u86", "repository": {"nameWithOwner": "me/Acadkit"}},
            {"number": 87, "title": "eval", "url": "u87", "repository": {"nameWithOwner": "me/Acadkit"}},
            {"number": 3, "title": "draft", "url": "u3", "repository": {"nameWithOwner": "me/other"}},
        ])
    if args[:2] == ["pr", "checks"]:
        n = args[2]
        if n == "3":
            raise RuntimeError("no checks reported")
        return json.dumps([{"bucket": "pass"}, {"bucket": "fail" if n == "87" else "pass"}])
    if args[:2] == ["api", "user"]:
        return "me\n"
    return json.dumps([
        {"type": "PushEvent", "created_at": "2026-11-27T20:00:00Z"},   # 28 Nov in India
        {"type": "PushEvent", "created_at": "2026-11-25T05:00:00Z"},
        {"type": "WatchEvent", "created_at": "2026-11-26T05:00:00Z"},
        {"type": "PushEvent", "created_at": "2026-11-01T05:00:00Z"},   # outside the week
    ])


class GitHub(unittest.TestCase):
    def test_lists_open_prs_with_their_ci_and_the_days_i_pushed(self):
        snap = snapshot(fake, NOW)
        self.assertEqual([(w["number"], w["ci"]) for w in snap["waiting"]], [(86, "passing"), (87, "failing"), (3, "none")])
        self.assertEqual(snap["pushed_days"], ["2026-11-25", "2026-11-28"])


if __name__ == "__main__":
    unittest.main()
