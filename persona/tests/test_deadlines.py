import json
import re
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

from persona.deadlines.__main__ import items_now
from persona.deadlines.extract import Roles, course_of, courses_from_pack, date_of, extract, is_candidate, is_circular, time_of
from persona.deadlines.model import Message, Trust
from persona.deadlines.output import suggestion, worth_suggesting, write_suggestions
from persona.deadlines.track import aliases_in, track
from persona.deadlines.verify import adjudicate, moved_from
from persona.store import add_messages, open_store

PACK = {
    "courses": [
        {"code": "21CSC204J", "short": "DAA", "name": "Design and Analysis of Algorithms"},
        {"code": "21CSC206T", "short": "AI", "name": "Artificial Intelligence", "cues": ["ai"]},
        {"code": "21CSC205P", "short": "DBMS", "name": "Database Management Systems"},
    ],
    "whatsapp": {"groups": ["AS1 OFFICIAL"], "faculty": [], "cr": ["cr@s.whatsapp.net"]},
}
COURSES = courses_from_pack(PACK)
ROLES = Roles.from_pack(PACK)
TODAY = date(2026, 11, 28)


def msg(i, when, text, sender="Dr. Rao", chat="AS1 OFFICIAL"):
    return Message(f"whatsapp:{i}", chat, sender, datetime.fromisoformat(when).replace(tzinfo=timezone.utc), text)


def items(*messages, ids=None, today=TODAY):
    return adjudicate(track(extract(list(messages), COURSES, ROLES, ids)), today)


class Reading(unittest.TestCase):
    def test_keeps_messages_with_an_assessment_word_and_a_date_cue(self):
        self.assertTrue(is_candidate("DAA FT-I on 27 Jan, Units 1 and 2"))
        self.assertTrue(is_candidate("DBMS lab record due Monday"))
        self.assertFalse(is_candidate("anyone free for lunch tomorrow"))
        self.assertFalse(is_candidate("FT-I portion is units 1 and 2"))

    def test_reads_dates_against_the_day_the_message_was_sent(self):
        oct13 = date(2026, 10, 13)
        self.assertEqual(date_of("FT-I on 27 Jan", oct13)[0], "2027-01-27")
        self.assertEqual(date_of("on 29 Oct 2026", oct13)[0], "2026-10-29")
        self.assertEqual(date_of("Jan 5th exam", oct13)[0], "2027-01-05")
        self.assertEqual(date_of("due 12/1", date(2026, 11, 28))[0], "2027-01-12")
        self.assertEqual(date_of("test tomorrow", oct13)[0], "2026-10-14")
        self.assertEqual(date_of("viva on Friday", date(2026, 11, 25))[0], "2026-11-27")
        self.assertEqual(date_of("complete till 11th experiment", oct13), (None, 0.4))
        self.assertEqual(date_of("at 10.30 am", oct13), (None, 0.4))
        self.assertEqual(date_of("27 Jan 10:30", oct13)[0], "2027-01-27")
        # "marks" is not March, and the date written first wins.
        self.assertEqual(date_of("Date: 11.11.2026 Day Order: DO5 Part A: 8 MCQs × 1 marks", oct13)[0], "2026-11-11")
        self.assertEqual(date_of("CT on 15th october, maybe shifted to 26th October", oct13)[0], "2026-10-15")

    def test_reads_on_the_nth_as_the_next_such_day(self):
        self.assertEqual(date_of("the os ct which is on 11th", date(2026, 10, 25)), ("2026-11-11", 0.6))
        self.assertEqual(date_of("submit by 3rd", date(2026, 11, 3)), ("2026-11-03", 0.6))

    def test_reads_times(self):
        self.assertEqual([time_of("10:30 am"), time_of("2 pm"), time_of("12 am"), time_of("at 14:15"), time_of("no time")],
                         ["10:30", "14:00", "00:00", "14:15", None])

    def test_names_the_first_course_mentioned_by_whole_words(self):
        self.assertEqual(course_of("DBMS and DAA tests", COURSES), "21CSC205P")
        self.assertEqual(course_of("design and analysis of algorithms ft", COURSES), "21CSC204J")
        self.assertIsNone(course_of("she said the test is on monday", COURSES))
        self.assertEqual(course_of("AI quiz on Monday", COURSES), "21CSC206T")

    def test_a_course_counts_only_near_an_assessment_word(self):
        circular = "Dear Students, the innovation challenge invites AI ideas from all years. " + "Details follow. " * 6 + "Registration review on 3 Dec."
        self.assertIsNone(course_of(circular, COURSES))
        self.assertEqual(course_of("guys is DBMS LAB assessment tomorrow", COURSES), "21CSC205P")

    def test_circulars_speak_for_the_department(self):
        self.assertTrue(is_circular("Dear Coordinators The *CT 1* for DAA is scheduled on 29th Oct"))
        self.assertFalse(is_circular("dear god this DAA test"))
        [it] = items(msg(1, "2026-11-20T04:30:00", "Dear Students, the DAA CT 1 is scheduled on 2 Feb.", sender="Sam"))
        self.assertEqual((it.winner.trust, suggestion(it)["source"]), (Trust.FACULTY, "WhatsApp · AS1 OFFICIAL · a circular · 20 Nov"))

    def test_ranks_senders(self):
        self.assertEqual(ROLES.trust("Dr. Rao"), Trust.FACULTY)
        self.assertEqual(ROLES.trust("Prof Iyer"), Trust.FACULTY)
        self.assertEqual(ROLES.trust("Riya", "cr@s.whatsapp.net"), Trust.CR)
        self.assertEqual(ROLES.trust("Riya"), Trust.RELAY)
        self.assertEqual(ROLES.trust("me"), Trust.ME)


class Tracking(unittest.TestCase):
    def test_normalises_instance_codes(self):
        self.assertEqual(aliases_in("FT-II (FJ2) and ct 1"), {"FT-II", "FJ-II", "CT-I"})

    def test_links_names_said_together_and_bare_mentions(self):
        out = items(
            msg(1, "2026-10-13T04:30:00", "DAA FT-II (FJ2) on 29 Oct 2026, units 2 and 3"),
            msg(2, "2026-10-20T04:30:00", "DAA FJ2 hall list out, test on 29 Oct", sender="Riya"),
            msg(3, "2026-10-25T10:00:00", "heard DAA test moved to 30th Oct? not sure", sender="Sam"),
            today=date(2026, 10, 26),
        )
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].label, "FT-II")
        self.assertEqual(len(out[0].history), 3)


    def test_a_bare_mention_after_a_test_has_passed_is_a_new_test(self):
        ct1, later = items(
            msg(1, "2026-09-30T04:30:00", "Dear Coordinators, the CT 1 for DAA is scheduled on 29th Oct 2026."),
            msg(2, "2026-11-09T04:30:00", "and what do we need to do in the daa ct which is on 11th", sender="Sam"),
        )
        self.assertEqual((ct1.date, later.date), ("2026-10-29", "2026-11-11"))
        self.assertNotIn("conflict", ct1.flags)

    def test_a_retest_is_its_own_event(self):
        ct, retest = items(
            msg(1, "2026-09-30T04:30:00", "we got DBMS CT on 15th october", sender="Sam"),
            msg(2, "2026-10-24T04:30:00", "Monday most probably DBMS retest", sender="Ana"),
        )
        self.assertEqual((ct.kind, ct.date), ("exam", "2026-10-15"))
        self.assertEqual((retest.kind, retest.label), ("retest", "Retest"))


class Verifying(unittest.TestCase):
    def test_faculty_beats_a_later_rumour_which_is_flagged_but_not_asked(self):
        [it] = items(
            msg(1, "2026-11-20T04:30:00", "DAA FT-I on 27 Jan, units 1 and 2"),
            msg(2, "2026-11-25T10:00:00", "DAA FT-I is on 28 Jan I think", sender="Sam"),
        )
        self.assertEqual((it.date, it.portion), ("2027-01-27", "units 1 and 2"))
        self.assertIn("conflict", it.flags)
        self.assertIsNone(it.question)

    def test_faculty_moving_a_date_is_a_move_from_the_old_one(self):
        [it] = items(
            msg(1, "2026-11-20T04:30:00", "DAA FT-I on 27 Jan"),
            msg(2, "2026-11-26T04:30:00", "DAA FT-I moved to 29 Jan, 10:30 am"),
        )
        self.assertEqual((it.date, it.time), ("2027-01-29", "10:30"))
        self.assertEqual(moved_from(it), "2027-01-27")

    def test_classmates_disagreeing_with_no_faculty_word_asks(self):
        [it] = items(
            msg(1, "2026-11-20T04:30:00", "DBMS CT-1 on 2 Feb", sender="Sam"),
            msg(2, "2026-11-21T04:30:00", "DBMS CT 1 on 3 Feb", sender="Ana"),
        )
        self.assertEqual(it.question, "21CSC205P CT-I: I have 2027-02-02 (a classmate) or 2027-02-03 (a classmate). Which is right?")

    def test_past_items_never_ask_and_undated_ones_do(self):
        past, undated = items(
            msg(1, "2026-10-01T04:30:00", "DBMS lab on 3 Oct", sender="Sam"),
            msg(2, "2026-11-27T04:30:00", "AI worksheet due soon, check the portion this week", sender="Sam"),
        )
        self.assertIn("past", past.flags)
        self.assertIsNone(past.question)
        self.assertIsNone(undated.date)
        self.assertIn("When is it?", undated.question)


class Suggesting(unittest.TestCase):
    def test_suggests_faculty_and_cr_dates_and_plain_classmate_ones(self):
        fac, rumour, plain = items(
            msg(1, "2026-11-20T04:30:00", "DAA FT-I on 27 Jan"),
            msg(2, "2026-11-21T04:30:00", "AI quiz on 5 Feb?", sender="Sam"),
            msg(3, "2026-11-22T04:30:00", "DBMS lab record due 4 Feb", sender="Ana"),
        )
        self.assertEqual([worth_suggesting(i) for i in (fac, rumour, plain)], [True, False, True])

    def test_writes_the_sync_format(self):
        [it] = items(
            msg(1, "2026-11-20T04:30:00", "DAA FT-I on 27 Jan"),
            msg(2, "2026-11-26T04:30:00", "DAA FT-I moved to 29 Jan, 10:30 am"),
        )
        s = suggestion(it)
        self.assertEqual(s["due_date"], "2027-01-29T10:30:00+05:30")
        self.assertRegex(s["due_date"], r"(Z|[+-]\d\d:\d\d)$")
        self.assertEqual(s["moved_from"], "2027-01-27T10:30:00+05:30")
        self.assertEqual((s["subject_code"], s["type"], s["label"]), ("21CSC204J", "exam", "FT-I"))
        self.assertEqual(s["source"], "WhatsApp · AS1 OFFICIAL · faculty · 26 Nov")
        self.assertEqual(s["evidence"], "DAA FT-I moved to 29 Jan, 10:30 am")
        with tempfile.TemporaryDirectory() as d:
            n = write_suggestions([it], Path(d) / "_src" / "persona_suggestions.json")
            body = json.loads((Path(d) / "_src" / "persona_suggestions.json").read_text())
        self.assertEqual((n, body["by"], len(body["deadlines"])), (1, "persona.deadlines", 1))


class EndToEnd(unittest.TestCase):
    def test_reads_stored_messages(self):
        with tempfile.TemporaryDirectory() as d:
            conn = open_store(Path(d) / "persona.sqlite")
            add_messages(conn, [
                {"source": "whatsapp", "id": "1", "chat": "AS1 OFFICIAL", "sender": "Riya", "sender_id": "cr@s.whatsapp.net",
                 "ts": "2026-11-20T04:30:00+00:00", "text": "DBMS CT-1 on 2 Feb, units 1 and 2", "from_me": 0},
                {"source": "whatsapp", "id": "2", "chat": "AS1 OFFICIAL", "sender": "Sam", "sender_id": "sam@s.whatsapp.net",
                 "ts": "2026-11-21T04:30:00+00:00", "text": "lunch?", "from_me": 0},
            ])
            [it] = items_now(conn, PACK, datetime(2026, 11, 28, tzinfo=timezone.utc))
            conn.close()
        self.assertEqual((it.date, it.winner.trust, it.label), ("2027-02-02", Trust.CR, "CT-I"))
        self.assertTrue(re.match(r"WhatsApp · AS1 OFFICIAL · the CR", suggestion(it)["source"]))


if __name__ == "__main__":
    unittest.main()
