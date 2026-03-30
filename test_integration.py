#!/usr/bin/env python3
"""Integration tests for fr_processor.py — runs the script via subprocess with the real FR folder."""

import sys
import os
import json
import subprocess
import unittest

# The real FR folder: look relative to project root, then fall back to sibling directory
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
_SCRIPT = os.path.join(_PROJECT_ROOT, 'python', 'fr_processor.py')

_FR_FOLDER_CANDIDATES = [
    os.path.join(_PROJECT_ROOT, 'FR'),           # ./FR inside project
    os.path.join(_PROJECT_ROOT, '..', 'FR'),     # ../FR sibling directory
]

FR_FOLDER = next((p for p in _FR_FOLDER_CANDIDATES if os.path.isdir(p)), None)
FR_NUMBER = "222"  # Known-good FR that must exist for integration tests to run


def run_script(*args):
    """Helper: run fr_processor.py with the given args, return CompletedProcess."""
    return subprocess.run(
        [sys.executable, _SCRIPT, *args],
        capture_output=True,
        text=True,
    )


@unittest.skipUnless(FR_FOLDER is not None, "FR folder not found — skipping integration tests")
@unittest.skipUnless(
    FR_FOLDER and os.path.exists(
        os.path.join(FR_FOLDER, 'FR200s', f'FR{FR_NUMBER}.doc')
    ) or FR_FOLDER and any(
        os.path.exists(os.path.join(FR_FOLDER, sub, f'FR{FR_NUMBER}{ext}'))
        for sub in ['FR200s', ''] for ext in ['.docx', '.doc']
    ),
    f"FR{FR_NUMBER} not found in FR folder — skipping integration tests",
)
class TestIntegration(unittest.TestCase):

    def test_output_is_valid_json(self):
        """Any command produces valid JSON on stdout."""
        result = run_script("preview", FR_NUMBER, FR_FOLDER)
        try:
            json.loads(result.stdout.strip())
        except json.JSONDecodeError as e:
            self.fail(f"stdout is not valid JSON: {e}\nstdout: {result.stdout!r}")

    def test_existing_fr_preview(self):
        """preview command returns JSON with title, content, filePath fields."""
        result = run_script("preview", FR_NUMBER, FR_FOLDER)
        self.assertEqual(result.returncode, 0, f"Unexpected exit code: {result.returncode}\nstderr: {result.stderr}")

        data = json.loads(result.stdout.strip())
        self.assertNotIn("error", data, f"Got error response: {data}")
        self.assertIn("title", data)
        self.assertIn("content", data)
        self.assertIn("filePath", data)

    def test_existing_fr_full(self):
        """full command returns JSON with headings and html fields."""
        result = run_script("full", FR_NUMBER, FR_FOLDER)
        self.assertEqual(result.returncode, 0, f"Unexpected exit code: {result.returncode}\nstderr: {result.stderr}")

        data = json.loads(result.stdout.strip())
        self.assertNotIn("error", data, f"Got error response: {data}")
        self.assertIn("headings", data)
        self.assertIn("html", data)

    def test_nonexistent_fr(self):
        """Non-existent FR returns {"error": "FR not found"} with exit code 0."""
        result = run_script("preview", "999", FR_FOLDER)
        self.assertEqual(result.returncode, 0, f"Expected exit code 0, got {result.returncode}")

        data = json.loads(result.stdout.strip())
        self.assertEqual(data, {"error": "FR not found"})


class TestIntegrationNoFolder(unittest.TestCase):
    """Tests that run regardless of whether the FR folder exists."""

    def test_nonexistent_folder_exits_zero(self):
        """Using a non-existent folder path exits 0 with an error JSON."""
        result = run_script("preview", "1", "/this/path/does/not/exist")
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout.strip())
        self.assertIn("error", data)

    def test_missing_args_exits_nonzero(self):
        """Running with too few args exits with code 1."""
        result = subprocess.run(
            [sys.executable, _SCRIPT],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)


if __name__ == "__main__":
    if FR_FOLDER:
        print(f"Using FR folder: {FR_FOLDER}")
    else:
        print("WARNING: FR folder not found — integration tests will be skipped")
    unittest.main(verbosity=2)
