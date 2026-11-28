import json
import sys
import tempfile
import unittest
from pathlib import Path

from persona.semester import run_pipeline


def folder_with(d: str, steps) -> Path:
    f = Path(d) / "SRM_Sem4"
    (f / "_src").mkdir(parents=True)
    (f / "_src" / "semester.json").write_text(json.dumps({"version": 1, "pipeline": steps}))
    return f


class Pipeline(unittest.TestCase):
    def test_runs_steps_in_the_semester_folder_and_stops_at_the_first_failure(self):
        py = sys.executable
        with tempfile.TemporaryDirectory() as d:
            f = folder_with(d, [
                f"{py} -c \"open('one.txt','w').write('1')\"",
                f"{py} -c \"import sys; sys.exit(3)\"",
                f"{py} -c \"open('never.txt','w').write('1')\"",
            ])
            ok, lines = run_pipeline(f, Path(d) / "semester.log")
            self.assertFalse(ok)
            self.assertTrue((f / "one.txt").exists())
            self.assertFalse((f / "never.txt").exists())
            self.assertTrue(lines[1].startswith("failed (3):"))
            self.assertIn("$ ", (Path(d) / "semester.log").read_text())

    def test_a_dry_run_lists_and_an_empty_pipeline_says_so(self):
        with tempfile.TemporaryDirectory() as d:
            f = folder_with(d, ["python3 -I _src/build_pyq_dataset.py"])
            self.assertEqual(run_pipeline(f, Path(d) / "l", dry_run=True), (True, ["would run: python3 -I _src/build_pyq_dataset.py"]))
        with tempfile.TemporaryDirectory() as d:
            ok, lines = run_pipeline(folder_with(d, []), Path(d) / "l")
            self.assertFalse(ok)
            self.assertIn("no pipeline", lines[0])


if __name__ == "__main__":
    unittest.main()
