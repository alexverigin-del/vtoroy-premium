"""Run cash-proof activation and rollback against a disposable network-less DB."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import time
import uuid

import activate_avito_expansion as operator
import prepare_avito_final_release as release
import test_avito_expansion_sql as fixture
from activate_avito_pilot import json_sql

stage = Path(__file__).parent
plan = json.loads((stage / "release-plan.json").read_text())
xml = (stage / "approved.xml").read_bytes()
name = "isvoi-avito-cash-qa-" + uuid.uuid4().hex[:10]
phases = []
created = False


def db(sql):
    result = subprocess.run(["docker", "exec", "-e", "PGPASSWORD=fixture-not-a-real-credential", "-i", name,
        "psql", "-h", "127.0.0.1", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
        input=sql, text=True, capture_output=True, timeout=90)
    if result.returncode:
        raise RuntimeError(result.stderr.splitlines()[0] if result.stderr else "Fixture query failed")
    return json.loads(result.stdout) if result.stdout.strip() else None


def rejected(sql, label):
    try:
        db(sql)
    except RuntimeError:
        phases.append(label)
        return
    raise AssertionError("Expected refusal: " + label)


try:
    subprocess.run(["docker", "image", "inspect", "postgres:16-alpine"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["docker", "run", "--pull=never", "--rm", "-d", "--network", "none", "--name", name,
        "-e", "POSTGRES_PASSWORD=fixture-not-a-real-credential", "postgres:16-alpine"],
        check=True, stdout=subprocess.DEVNULL)
    created = True
    for _ in range(60):
        if subprocess.run(["docker", "exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], capture_output=True).returncode == 0:
            break
        time.sleep(.5)
    else:
        raise RuntimeError("Isolated DB did not start")
    fixture.SCHEMA += "\nALTER TABLE products ADD COLUMN source_id text; ALTER TABLE inventory_items ADD COLUMN source_id text, ADD COLUMN barcode text;"
    mapping = {"id": release.MAPPING_ID, "channel": "avito", "product_category": release.CATEGORY_ID,
        "external_category": "Телефоны", "external_goods_type": "Мобильные телефоны",
        "template_version": plan["mapping_version"], "is_active": True, "is_confirmed": True, "default_attributes": {}}
    state = {"mapping": mapping, "listings": []}
    for product in plan["expected_before"]["products"]:
        state["listings"].append({**product["listings"][0], "product": product["id"], "notes": "fixture note",
                                  "updated_at": "2026-10-14T00:00:00+00:00"})
    state["listings"].sort(key=lambda r: r["id"])
    db(fixture.seed(plan, state))
    for index, product in enumerate(plan["expected_before"]["products"], 1):
        identity = product["listings"][0]["external_id"]
        if identity not in plan["cash_stock_approvals"]["entries"]:
            continue
        proof = plan["cash_stock_approvals"]["entries"][identity]
        serial = "QAONLYFIXTURESERIAL" + str(index)
        proof["serialSha256"] = hashlib.sha256(serial.encode()).hexdigest()
        proof["barcodeSha256"] = hashlib.sha256(("QA" + str(index)).encode()).hexdigest()
        db(f"UPDATE inventory_items SET source_id=({json_sql(proof['sourceId'])}#>>'{{}}'),barcode='QA{index}' WHERE id='{proof['inventoryId']}'; UPDATE products SET source_id=({json_sql(proof['sourceId'])}#>>'{{}}') WHERE id=({json_sql(proof['productId'])}#>>'{{}}');")
    operator.db = db
    source = db(operator.SOURCE_QUERY)
    source.pop("_private_identifiers")
    plan["expected_before"] = {"products": sorted(source["products"], key=lambda p: p["id"]), "stores": source["stores"]}
    plan["expected_active"] = release.projection(plan["expected_before"], plan["desired"], plan["mapping_version"])
    release.validate_plan(plan, xml)
    before = operator.read_state(release.ALL_IDS)
    def transaction(write=False, commit=False):
        return operator.transaction_sql(plan, operator.read_state(release.ALL_IDS), xml, write=write, commit=commit,
            identities=release.IDENTITIES, new_rows=release.NEW, extra_guard_sql=release.transaction_guards(plan), expected_count=2)
    dry = db(transaction())
    rehearsal = db(transaction(True))
    assert dry["changed"] == 0 and rehearsal["changed"] == 2 and operator.read_state(release.ALL_IDS) == before
    phases.extend(["dry_run_no_change", "write_rehearsal_rolled_back"])
    for proof in plan["cash_stock_approvals"]["entries"].values():
        for field, value in (("barcode", "OTHER"), ("serial_full", "OTHER"), ("source_id", "OTHER"),
                             ("source_sku", "OTHER"), ("identity_status", "conflict")):
            original = db(f"SELECT to_jsonb({field}) FROM inventory_items WHERE id='{proof['inventoryId']}';")
            db(f"UPDATE inventory_items SET {field}=({json_sql(value)}#>>'{{}}') WHERE id='{proof['inventoryId']}';")
            rejected(transaction(True, True), "cash_" + field + "_drift_refused")
            db(f"UPDATE inventory_items SET {field}=({json_sql(original)}#>>'{{}}') WHERE id='{proof['inventoryId']}';")
    target = plan["desired"][0]
    db(f"UPDATE products SET stock_quantity=0 WHERE id=({json_sql(target['product'])}#>>'{{}}');")
    rejected(transaction(True, True), "sold_or_zero_stock_refused")
    db(f"UPDATE products SET stock_quantity=1 WHERE id=({json_sql(target['product'])}#>>'{{}}');")
    db("INSERT INTO products(id,price) VALUES('fixture-unrelated',10); CREATE FUNCTION qa_sideeffect() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE products SET price=11 WHERE id='fixture-unrelated'; RETURN NEW; END$$; CREATE TRIGGER qa_sideeffect AFTER UPDATE ON product_channel_listings FOR EACH ROW EXECUTE FUNCTION qa_sideeffect();")
    rejected(transaction(True, True), "collateral_trigger_refused")
    assert db("SELECT to_jsonb(price) FROM products WHERE id='fixture-unrelated';") == 10
    db("DROP TRIGGER qa_sideeffect ON product_channel_listings; DROP FUNCTION qa_sideeffect();")
    applied = db(transaction(True, True))
    after = operator.read_state(release.ALL_IDS)
    assert applied["changed"] == 2 and [r for r in after["listings"] if r["external_id"] in release.EXISTING] == [r for r in before["listings"] if r["external_id"] in release.EXISTING]
    again = db(transaction(True, True))
    assert again["changed"] == 0 and again["already_applied"]
    phases.extend(["only_two_rows_applied", "idempotent_apply"])
    receipt = {"xml_sha256": plan["xml_sha256"], "before": before, "after": applied["new_after"]}
    db(operator.rollback_sql(plan, after, receipt, release.NEW, expected_count=2))
    rolled = operator.read_state(release.ALL_IDS)
    for row in rolled["listings"]:
        prior = next(r for r in before["listings"] if r["id"] == row["id"])
        assert all(row[key] == prior[key] for key in release.EDIT_FIELDS)
    phases.append("rollback_restores_two_drafts")
    print(json.dumps({"ok": True, "phases": phases, "fixture_network": "none", "production_database_used": False}))
finally:
    if created:
        subprocess.run(["docker", "rm", "-f", name], check=True, stdout=subprocess.DEVNULL)
