import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from persona.portal import attendance, courses, decode, ingest, marks, planner
from persona.store import open_store

NOW = datetime(2026, 11, 28, 5, 30, tzinfo=timezone.utc)

# Shaped like the real pages (28 Nov 2026), with made-up numbers and names.
ATTENDANCE = """<div><table class="table"><thead><tr><th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th>
<th>Absent hours</th><th>Total Percentage</th></tr></thead><tbody>
<tr><td>21CSC201J</td><td>DATA STRUCTURES AND ALGORITHMS</td><td>86</td><td>57</td><td>29</td><td>66.28</td></tr>
<tr><td>21CSC202J</td><td>OPERATING SYSTEMS</td><td>90</td><td>80</td><td>10</td><td>88.89</td></tr>
<tr><td colspan="6">Total</td></tr></tbody></table>
<table><tr><th>Month / Year</th><th>Present</th><th>Absent</th></tr><tr><td>Jul-2026</td><td>0</td><td>42</td></tr></table></div>"""

MARKS = """<table><tr><th>Code</th><th>Description</th><th>Mark / Max. Mark</th><th></th></tr>
<tr><td>21CSC206P</td><td>ADVANCED OBJECT ORIENTED PROGRAMMING</td><td>72.60 / 100.00</td><td><a>View Details</a></td></tr>
<tr><td>21CSC202J</td><td>OPERATING SYSTEMS</td><td>41.00 / 60.00</td><td><a>View Details</a></td></tr></table>"""

# Academia wraps a page in pageSanitizer.sanitize('…') with \\n, \\/ and \\xNN escapes.
TIMETABLE = (
    "<script>var x = 1;pageSanitizer.sanitize('<table border=\\x221\\x22>\\n<tr><td>S.No<\\/td><td>Course Code<\\/td>"
    "<td>Course Title<\\/td><td>Credit<\\/td><td>Regn. Type<\\/td><td>Category<\\/td><td>Course Type<\\/td>"
    "<td>Faculty Name<\\/td><td>Slot<\\/td><td>Room No.<\\/td><td>Academic Year<\\/td><\\/tr>\\n"
    "<tr><td>1<\\/td><td>21CSC204J<\\/td><td>Design and Analysis of Algorithms<\\/td><td>4<\\/td><td>Regular<\\/td>"
    "<td>Professional Core<\\/td><td>Theory<\\/td><td>Dr. Asha R (100001)<\\/td><td>A<\\/td><td>TP 1506<\\/td>"
    "<td>AY2026-27-EVEN<\\/td><\\/tr><\\/table>');function doaction(){}</script>"
)

# The planner arrives entity-escaped.
PLANNER = (
    '<div id="zcPageLiveHtml">&lt;table&gt;&lt;tr&gt;&lt;td&gt;Dt&lt;/td&gt;&lt;td&gt;Day&lt;/td&gt;&lt;td&gt;Jan &#39;27&lt;/td&gt;'
    "&lt;td&gt;DO&lt;/td&gt;&lt;td&gt;&lt;/td&gt;&lt;td&gt;Dt&lt;/td&gt;&lt;td&gt;Day&lt;/td&gt;&lt;td&gt;Feb &#39;27&lt;/td&gt;&lt;td&gt;DO&lt;/td&gt;&lt;/tr&gt;"
    "&lt;tr&gt;&lt;td&gt;1&lt;/td&gt;&lt;td&gt;Fri&lt;/td&gt;&lt;td&gt;New Year&#39;s Day - Holiday&lt;/td&gt;&lt;td&gt;-&lt;/td&gt;&lt;td&gt;-&lt;/td&gt;"
    "&lt;td&gt;1&lt;/td&gt;&lt;td&gt;Mon&lt;/td&gt;&lt;td&gt;&lt;/td&gt;&lt;td&gt;5&lt;/td&gt;&lt;/tr&gt;"
    "&lt;tr&gt;&lt;td&gt;7&lt;/td&gt;&lt;td&gt;Thu&lt;/td&gt;&lt;td&gt;Commencement of Classes&lt;/td&gt;&lt;td&gt;1&lt;/td&gt;&lt;td&gt;-&lt;/td&gt;"
    "&lt;td&gt;29&lt;/td&gt;&lt;td&gt;-&lt;/td&gt;&lt;td&gt;&lt;/td&gt;&lt;td&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</div>"
)


class Pages(unittest.TestCase):
    def test_reads_attendance_by_header_and_skips_the_total_row(self):
        self.assertEqual(attendance(ATTENDANCE), [
            {"code": "21CSC201J", "title": "DATA STRUCTURES AND ALGORITHMS", "conducted": 86, "attended": 57, "absent": 29, "percentage": 66.28},
            {"code": "21CSC202J", "title": "OPERATING SYSTEMS", "conducted": 90, "attended": 80, "absent": 10, "percentage": 88.89},
        ])

    def test_reads_marks_totals(self):
        self.assertEqual([(m["code"], m["mark"], m["max"]) for m in marks(MARKS)], [("21CSC206P", 72.6, 100.0), ("21CSC202J", 41.0, 60.0)])

    def test_unwraps_academias_escaped_pages(self):
        self.assertIn('<table border="1">', decode(TIMETABLE))
        self.assertIn("<table>", decode(PLANNER))

    def test_reads_the_timetable_with_faculty_names_without_ids(self):
        self.assertEqual(courses(TIMETABLE), [{"code": "21CSC204J", "name": "Design and Analysis of Algorithms", "credits": 4.0,
                                               "type": "Theory", "faculty": "Dr. Asha R", "slot": "A", "room": "TP 1506"}])

    def test_reads_the_planners_day_orders_and_events(self):
        days = planner(PLANNER)
        self.assertEqual(days["2027-01-01"], {"do": None, "event": "New Year's Day - Holiday"})
        self.assertEqual(days["2027-01-07"], {"do": 1, "event": "Commencement of Classes"})
        self.assertEqual(days["2027-02-01"]["do"], 5)
        self.assertNotIn("2027-02-29", days)

    def test_a_page_without_the_table_reads_as_nothing(self):
        self.assertEqual((attendance("<p>Session expired</p>"), marks(""), courses(""), planner("")), ([], [], [], {}))


class Ingest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        d = Path(self.dir.name)
        self.store = open_store(d / "p.sqlite")
        self.state = d / "portal" / "state.json"
        self.pack = d / "SRM_Sem4" / "_src" / "semester.json"
        self.pack.parent.mkdir(parents=True)
        self.pack.write_text(json.dumps({"version": 1, "courses": [{"code": "21CSC204J", "short": "DAA", "name": "Design and Analysis of Algorithms", "cues": []}],
                                         "whatsapp": {"groups": ["AS1 OFFICIAL"], "faculty": [], "cr": []}}))

    def tearDown(self):
        self.store.close()
        self.dir.cleanup()

    def signals(self):
        return [dict(r) for r in self.store.execute("SELECT kind, title FROM signals ORDER BY at, id")]

    def test_keeps_attendance_and_signals_changed_marks(self):
        raw = {"portal": {"attendance": ATTENDANCE, "marks": MARKS}, "academia": {"tab": False}}
        self.assertEqual(ingest(raw, self.store, self.state, self.pack, NOW), "portal: 2 subjects; academia: no tab open")
        self.assertEqual(json.loads(self.state.read_text())["portal"]["attendance"][1]["conducted"], 90)
        self.assertEqual(self.signals(), [])
        later = {"portal": {"attendance": ATTENDANCE, "marks": MARKS.replace("41.00 / 60.00", "48.50 / 60.00")}}
        ingest(later, self.store, self.state, self.pack, NOW)
        self.assertEqual(self.signals(), [{"kind": "marks", "title": "Operating Systems: 48.5 / 60 (was 41)"}])

    def test_a_logout_closes_the_session_signals_once_and_keeps_the_last_read(self):
        login = datetime(2026, 11, 28, 5, 30, tzinfo=timezone.utc)
        out = datetime(2026, 11, 28, 10, 20, tzinfo=timezone.utc)  # 4 h 50 min later
        ingest({"portal": {"attendance": ATTENDANCE, "marks": MARKS}}, self.store, self.state, self.pack, login)
        self.assertEqual(ingest({"portal": {"login": True}}, self.store, self.state, self.pack, out), "portal: logged out")
        ingest({"portal": {"login": True}}, self.store, self.state, self.pack, out)  # still out: no new signal
        state = json.loads(self.state.read_text())
        self.assertTrue(state["portal"]["login"])
        self.assertEqual(len(state["portal"]["attendance"]), 2)
        self.assertEqual(state["portal"]["logout_at"], out.isoformat())
        self.assertEqual(state["portal"]["sessions"], [{"in": login.isoformat(), "out": out.isoformat()}])
        titles = [s["title"] for s in self.signals()]
        self.assertEqual(len(titles), 1)
        self.assertIn("logged out at 15:50 (4 h 50 min held)", titles[0])

    def test_logging_back_in_starts_a_new_session(self):
        t0 = datetime(2026, 11, 28, 3, tzinfo=timezone.utc)
        t1 = datetime(2026, 11, 28, 6, tzinfo=timezone.utc)
        t2 = datetime(2026, 11, 28, 9, tzinfo=timezone.utc)
        ingest({"portal": {"attendance": ATTENDANCE, "marks": MARKS}}, self.store, self.state, self.pack, t0)
        ingest({"portal": {"login": True}}, self.store, self.state, self.pack, t1)
        ingest({"portal": {"attendance": ATTENDANCE, "marks": MARKS}}, self.store, self.state, self.pack, t2)
        state = json.loads(self.state.read_text())
        self.assertFalse(state["portal"]["login"])
        self.assertIsNone(state["portal"]["logout_at"])
        self.assertEqual([(s["in"], s["out"]) for s in state["portal"]["sessions"]],
                         [(t0.isoformat(), t1.isoformat()), (t2.isoformat(), None)])

    def test_keeps_every_faculty_of_a_course_with_a_lab(self):
        lab = TIMETABLE.replace("<\\/table>", "<tr><td>2<td>21CSC204J<td>Design and Analysis of Algorithms<td>0<td>Regular<td>Core<td>Lab"
                                "<td>Dr.V.Rao (100002)<td>P13-P14-<td>TP 201<td>AY2026-27-EVEN<\\/table>")
        ingest({"academia": {"timetable": lab, "planners": []}}, self.store, self.state, self.pack, NOW)
        pack = json.loads(self.pack.read_text())
        self.assertEqual((pack["courses"][0]["faculty"], pack["courses"][0]["slots"]), (["Dr. Asha R", "Dr.V.Rao"], ["A", "P13-P14-"]))
        self.assertEqual(pack["whatsapp"]["faculty"], ["Dr. Asha R", "Dr.V.Rao"])

    def test_fills_the_pack_from_academia(self):
        raw = {"academia": {"timetable": TIMETABLE, "planners": [{"name": "Academic_Planner_2026_27_EVEN", "html": PLANNER}]}}
        self.assertEqual(ingest(raw, self.store, self.state, self.pack, NOW), "academia: 1 courses, 3 days")
        pack = json.loads(self.pack.read_text())
        self.assertEqual(pack["courses"][0]["faculty"], ["Dr. Asha R"])
        self.assertEqual(pack["courses"][0]["slots"], ["A"])
        self.assertEqual(pack["courses"][0]["short"], "DAA")
        self.assertEqual(pack["whatsapp"]["faculty"], ["Dr. Asha R"])
        self.assertEqual(pack["calendar"]["2027-01-07"]["do"], 1)


if __name__ == "__main__":
    unittest.main()
