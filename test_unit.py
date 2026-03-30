#!/usr/bin/env python3
"""Unit tests for fr_processor.py — tests individual functions in isolation."""

import sys
import os
import json
import subprocess
import unittest
from unittest.mock import patch, MagicMock

# Add python/ directory to path so we can import fr_processor
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'python'))

import fr_processor


class TestEscapeHtml(unittest.TestCase):
    def test_escape_html(self):
        result = fr_processor.escape_html('a & b < c > d "quoted"')
        self.assertEqual(result, 'a &amp; b &lt; c &gt; d &quot;quoted&quot;')

    def test_escape_html_no_special_chars(self):
        self.assertEqual(fr_processor.escape_html("hello world"), "hello world")

    def test_escape_html_only_ampersand(self):
        self.assertEqual(fr_processor.escape_html("R&D"), "R&amp;D")


class TestFindFrFile(unittest.TestCase):
    def test_find_fr_file_found(self):
        """Returns the correct path when FR222.doc exists in the expected subfolder."""
        fake_folder = "/fake/fr/folder"
        expected_path = os.path.join(fake_folder, "FR200s", "FR222.doc")

        def fake_exists(path):
            return path == expected_path

        with patch("os.path.exists", side_effect=fake_exists):
            result = fr_processor.find_fr_file("222", fake_folder)

        self.assertEqual(result, expected_path)

    def test_find_fr_file_found_docx(self):
        """Returns the .docx path when FR222.docx exists."""
        fake_folder = "/fake/fr/folder"
        expected_path = os.path.join(fake_folder, "FR200s", "FR222.docx")

        def fake_exists(path):
            return path == expected_path

        with patch("os.path.exists", side_effect=fake_exists):
            result = fr_processor.find_fr_file("222", fake_folder)

        self.assertEqual(result, expected_path)

    def test_find_fr_file_not_found(self):
        """Returns None for a non-existent FR number."""
        with patch("os.path.exists", return_value=False), \
             patch("glob.glob", return_value=[]):
            result = fr_processor.find_fr_file("9999", "/fake/folder")

        self.assertIsNone(result)

    def test_find_fr_file_subfolder_logic(self):
        """FR300 should look in FR300s subfolder."""
        fake_folder = "/fake/fr/folder"
        expected_path = os.path.join(fake_folder, "FR300s", "FR300.docx")

        def fake_exists(path):
            return path == expected_path

        with patch("os.path.exists", side_effect=fake_exists):
            result = fr_processor.find_fr_file("300", fake_folder)

        self.assertEqual(result, expected_path)


class TestGetPreview(unittest.TestCase):
    def test_get_preview_no_file(self):
        """get_preview() returns None when the file doesn't exist."""
        with patch.object(fr_processor, "find_fr_file", return_value=None):
            result = fr_processor.get_preview("9999", "/fake/folder")
        self.assertIsNone(result)

    def test_get_preview_returns_expected_keys(self):
        """get_preview() returns dict with title, status, content, filePath."""
        fake_path = "/fake/FR222.docx"
        fake_data = {
            "title": "FR 222 Test",
            "status": "Approved",
            "content": "Some content",
            "headings": ["FR 222 Test"],
            "html": "<h1>FR 222 Test</h1>",
            "filePath": fake_path,
        }
        with patch.object(fr_processor, "find_fr_file", return_value=fake_path), \
             patch.object(fr_processor, "read_docx", return_value=fake_data):
            result = fr_processor.get_preview("222", "/fake/folder")

        self.assertIsNotNone(result)
        self.assertIn("title", result)
        self.assertIn("content", result)
        self.assertIn("filePath", result)
        self.assertNotIn("html", result)  # preview excludes html/headings


class TestMainFrNotFound(unittest.TestCase):
    def test_main_fr_not_found_exits_zero(self):
        """Script outputs {"error": "FR not found"} and exits with code 0."""
        script = os.path.join(os.path.dirname(__file__), '..', 'python', 'fr_processor.py')
        result = subprocess.run(
            [sys.executable, script, "preview", "99999", "/nonexistent/folder"],
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 0, f"Expected exit code 0, got {result.returncode}")

        output = json.loads(result.stdout.strip())
        self.assertEqual(output, {"error": "FR not found"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
