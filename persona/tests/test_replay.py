import unittest
from datetime import datetime, timezone

from persona.deadlines.extract import Roles, courses_from_pack
from persona.deadlines.model import Message
from persona.deadlines.replay import courses_from_subjects, replay, report, truths

SUBJECTS = [
    {"id": "s1", "code": "21CSC204J", "short_name": "DAA", "name": "Design and Analysis of Algorithms"},
    {"id": "s2", "code": "21CSC205P", "short_name": "DBMS", "name": "Database Management Systems"},
]
COURSES = courses_from_pack({"courses": courses_from_subjects(SUBJECTS)})


def msg(i, when, text, sender="Sam"):
    return Message(f"whatsapp:{i}", "AS1 OFFICIAL", sender, datetime.fromisoformat(when).replace(tzinfo=timezone.utc), text)


class Replay(unittest.TestCase):
    def setUp(self):
        self.truth = truths(
            [
                {"subject_id": "s1", "title": "CT-I", "due_date": "2026-11-12T04:00:00+00:00"},
                {"subject_id": "s2", "title": "Lab exam", "due_date": "2026-11-25T04:00:00+00:00"},
                {"subject_id": "s1", "title": "Old", "due_date": "2026-08-01T04:00:00+00:00"},
            ],
            SUBJECTS,
        )
        self.msgs = [
            msg(1, "2026-11-01T05:00:00", "DAA CT 1 on 10 Nov?"),
            msg(2, "2026-11-02T05:00:00", "Dear Students, the DAA CT 1 is on 12 Nov."),
            msg(3, "2026-11-05T05:00:00", "DAA CT 1 moved to 13 Nov"),
            msg(4, "2026-11-06T05:00:00", "DBMS lab record due 20 Nov"),
        ]
        self.r = replay(self.msgs, COURSES, Roles(), self.truth)

    def test_counts_the_window_and_what_the_engine_got_right(self):
        self.assertEqual((self.r["truth"], self.r["found"], self.r["recall"]), (2, 1, 0.5))
        self.assertEqual(self.r["missed"], ["2026-11-25 21CSC205P Lab exam"])

    def test_counts_dated_items_that_match_nothing(self):
        self.assertEqual((self.r["items"], self.r["matched"]), (2, 1))
        self.assertEqual(self.r["unmatched"], ["2026-11-20 21CSC205P Lab"])

    def test_measures_lead_from_the_first_day_it_was_right(self):
        self.assertEqual(self.r["lead_days_median"], 10)

    def test_beats_the_latest_message_baseline_when_a_rumour_comes_last(self):
        self.assertEqual(self.r["baseline_found"], 0)
        self.assertIn("Baseline (latest message wins): 0 of 2; ranked by who said it: 1.", report(self.r))


if __name__ == "__main__":
    unittest.main()
