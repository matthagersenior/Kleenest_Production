"""Run: python -m unittest scripts/test_overture_hydration_worker.py"""
import importlib.util
import os
import pathlib
import unittest
from unittest.mock import patch

MODULE = pathlib.Path(__file__).with_name("overture_hydration_worker.py")
spec = importlib.util.spec_from_file_location("overture_hydration_worker", MODULE)

class OvertureWorkerTests(unittest.TestCase):
    def load_worker(self):
        with patch.dict(os.environ, {
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "test-only",
        }):
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module

    def test_rejects_malformed_release_before_query(self):
        worker = self.load_worker()
        class NeverQuery:
            def execute(self, *_):
                self.fail_called = True
                raise AssertionError("query should not run")
        with self.assertRaises(ValueError):
            worker.extract(NeverQuery(), "../unsafe", [-91, 38, -90, 39], "")

    def test_rejects_invalid_bbox_before_query(self):
        worker = self.load_worker()
        class NeverQuery:
            def execute(self, *_):
                raise AssertionError("query should not run")
        for bbox in ([], [-90, 38, -91, 39], [-200, 38, -90, 39], [float('nan'), 38, -90, 39]):
            with self.subTest(bbox=bbox), self.assertRaises(ValueError):
                worker.extract(NeverQuery(), "2026-09-23.1", bbox, "")

    def test_stable_id_cursor_and_bounded_query(self):
        worker = self.load_worker()
        class Connection:
            def execute(self, query, params):
                self.query = query
                self.params = params
                return self
            def fetchall(self):
                return [("id-2", "Name", "restaurant", -90.0, 38.0)]
        conn = Connection()
        result = worker.extract(conn, "2026-09-23.1", [-91, 37, -89, 39], "id-1")
        self.assertEqual(result[0][0], "id-2")
        self.assertEqual(conn.params[5], "id-1")
        self.assertLessEqual(conn.params[-1], 500)
        self.assertIn("ORDER BY id", conn.query)
        self.assertIn("ST_X(ST_GeomFromWKB(geometry)) BETWEEN", conn.query)
        self.assertIn("ST_Y(ST_GeomFromWKB(geometry)) BETWEEN", conn.query)

if __name__ == "__main__":
    unittest.main()
