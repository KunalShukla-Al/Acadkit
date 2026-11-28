import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from persona.env import environment, parse


class EnvFile(unittest.TestCase):
    def test_parses_dotenv_lines(self):
        text = '# comment\n\nSTUDY_DIR="~/Downloads/SRM_Sem4"\nexport PIN=1234\nBAD LINE\nEMPTY=\nQUOTED=\'a b\'\n'
        self.assertEqual(parse(text), {"STUDY_DIR": "~/Downloads/SRM_Sem4", "PIN": "1234", "EMPTY": "", "QUOTED": "a b"})

    def test_the_process_environment_wins_and_a_missing_file_is_fine(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / ".env.local"
            f.write_text("STUDY_DIR=/from/file\nONLY_FILE=yes\n")
            with mock.patch.dict(os.environ, {"STUDY_DIR": "/from/process"}):
                env = environment(f)
                self.assertEqual((env["STUDY_DIR"], env["ONLY_FILE"]), ("/from/process", "yes"))
            self.assertNotIn("ONLY_FILE", environment(Path(d) / "none"))


if __name__ == "__main__":
    unittest.main()
