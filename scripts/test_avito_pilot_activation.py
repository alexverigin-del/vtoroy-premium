import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import activate_avito_pilot as pilot


class ActivationTests(unittest.TestCase):
    def test_changed_xml_rejected_before_database_access(self):
        with tempfile.TemporaryDirectory() as folder:
            xml = Path(folder) / "pilot.xml"
            xml.write_text("<Ads/>")
            with self.assertRaisesRegex(ValueError, "approved pilot"):
                pilot.approved_rows(xml)

    def test_exact_ids_required_even_for_hash_matched_input(self):
        with tempfile.TemporaryDirectory() as folder:
            xml = Path(folder) / "pilot.xml"
            xml.write_bytes(b"<Ads><Ad><Id>unapproved</Id></Ad></Ads>")
            with patch.object(pilot, "APPROVED_HASH", hashlib.sha256(xml.read_bytes()).hexdigest()):
                with self.assertRaisesRegex(ValueError, "three approved"):
                    pilot.approved_rows(xml)

    def test_json_sql_roundtrip_and_no_literal_interpolation(self):
        value = {"description": "'; DROP TABLE products; --", "text": "\u0411/\u0443"}
        sql = pilot.json_sql(value)
        encoded = sql.split("decode('")[1].split("'")[0]
        self.assertEqual(json.loads(bytes.fromhex(encoded)), value)
        self.assertNotIn("DROP TABLE", sql)

    def test_guard_locks_and_checks_source_without_writing_it(self):
        sql = pilot.guard_sql([], {"listings": []})
        self.assertIn("FOR UPDATE", sql)
        self.assertIn("Listing changed since preview", sql)
        self.assertIn("p.stock_status='available'", sql)
        self.assertIn("i.identity_status='matched'", sql)
        self.assertIn("d.battery='100%'", sql)
        self.assertNotIn("UPDATE products", sql)
        self.assertNotIn("UPDATE inventory_items", sql)

    def test_rollback_detects_operator_edits_but_ignores_unowned_fields(self):
        before = {"status": "active", "attributes": {"Color": "white"}}
        self.assertTrue(pilot.same_fields({**before, "last_exported_at": "later"}, before))
        self.assertFalse(pilot.same_fields({**before, "status": "draft"}, before))


if __name__ == "__main__":
    unittest.main()
