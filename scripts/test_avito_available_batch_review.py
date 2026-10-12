"""Sanitized regression checks for a sold member and truthful grade-B export."""
from copy import deepcopy
import hashlib
import unittest
import xml.etree.ElementTree as ET

from prepare_avito_available_batch_review import build_review, digest, NEW_IDS, EXISTING_SKUS, EXISTING_IDS, REFERENCE_MODELS
from prepare_avito_catalog_workbook import balanced_copy, image_urls, prepare
from test_avito_catalog_preparation import fixture


def evidence():
    template, _ = fixture()
    snapshot = {"captured_at": "2026-10-12T13:00:00Z", "private_identifier_redactions": 0,
                "stores": [{"slug": "belgorod", "status": "published", "address": "Тестовый адрес"}], "products": []}
    for index, sku in enumerate(sorted(EXISTING_SKUS) + list(NEW_IDS), 1):
        p = deepcopy(template)
        p.update(id="fixture-" + str(index), sku=sku)
        p["listing_file"] = f"00000000-0000-4000-8000-{index:012d}"
        p["inventory"][0]["source_sku"] = sku
        p["listings"] = [{"external_id": NEW_IDS[sku] if sku in NEW_IDS else EXISTING_IDS[sku],
                          "status": "draft" if sku in NEW_IDS else "active", "mapping_active": True, "mapping_confirmed": True}]
        if sku == "т11":
            p.update(stock_status="sold", stock_quantity=0)
            p["offers"][0].update(stock_status="sold", stock_quantity=0)
        if sku in ("т18", "т20"):
            p.update(model="iPhone 15 Pro Max", color="Blue Titanium" if sku == "т18" else "Natural Titanium")
        if sku in ("т18", "т39"):
            p["device_details"][0]["grade"] = "B"
        if sku == "т39":
            p["passports"][0]["condition_note"] = "Грейд B из-за мелких потертостей и точечных следов на боковинах."
        if sku == "т18":
            p["device_details"][0]["battery"] = "88%"
            p["passports"][0]["condition_note"] = "Грейд B из-за состояния аккумулятора 88%. Нет замечаний по корпусу."
        title, description = balanced_copy(p, "Тестовый адрес")
        p["listings"][0].update(title_override=title, description_override=description)
        snapshot["products"].append(p)
    public = {"captured_at": snapshot["captured_at"], "ok": True,
              "pages": [{"product_id": p["id"], "ok": True} for p in snapshot["products"]],
              "certificates": [{"sku": p["sku"], "ok": True} for p in snapshot["products"]],
              "images": {"products": [{"product_id": p["id"], "ok": True} for p in snapshot["products"]]}}
    root = ET.Element("Ads", {"formatVersion": "3", "target": "Avito.ru"})
    for p in snapshot["products"]:
        if p["sku"] in NEW_IDS or p["sku"] == "т11":
            continue
        l = p["listings"][0]
        ad = ET.SubElement(root, "Ad")
        values = {"Id": l["external_id"], "Category": "Телефоны", "GoodsType": "Мобильные телефоны",
                  "Address": "Тестовый адрес", "Title": l["title_override"], "Description": l["description_override"],
                  "Price": "40000", "AdType": "Товар приобретен на продажу", "Condition": "Б/у",
                  "Vendor": "Apple", "Model": "iPhone 14 Pro", "MemorySize": "256 ГБ", "Color": "серебристый",
                  "RamSize": "6 ГБ", "Akb": "98", "DeviceFlaws": "Включается",
                  "ScreenCondition": "Без дефектов", "CaseCondition": "Без дефектов"}
        for key, value in values.items():
            ET.SubElement(ad, key).text = value
        ET.SubElement(ET.SubElement(ad, "Images"), "Image", {"url": image_urls(p)[0]})
    xml = ET.tostring(root)
    entries = {e["sku"]: e for e in prepare(snapshot, public, {})["entries"]}
    approval = {"source": "owner_chat_confirmation", "scope": "exact_copy_and_physical_facts_not_publication",
                "confirmed_on": "2026-10-12", "copy_operator_approved": True, "publication_authorized": False,
                "existing_feed_sha256": hashlib.sha256(xml).hexdigest(),
                "existing_ids": [a.findtext("Id") for a in root], "entries": []}
    for sku in NEW_IDS:
        e = entries[sku]
        p = next(p for p in snapshot["products"] if p["sku"] == sku)
        d = p["device_details"][0]
        approval["entries"].append({"sku": sku, "product_id": e["product_id"], "external_id": e["external_id"],
            "price_rub": e["price_rub"], "owner_facts_confirmed": True, "image_urls": e["image_urls"],
            "title_sha256": digest(e["title_override"]), "description_sha256": digest(e["description_override"]),
            "grade": d["grade"], "diagnostic_date": d["diagnostic_date"], "battery_percent": int(d["battery"][:-1]),
            "battery_cycles": d["battery_cycles"], "confirmed_phone_attributes": {"ScreenCondition": "Без дефектов",
                "BoxSealed": "Нет", "CaseCondition": "Мелкие царапины" if sku == "т39" else "Без дефектов"}})
    references = {"scope": "model_hardware_reference_not_avito_catalog_validation", "checked_on": "2026-10-12",
                  "models": {model: {"attributes": {"RamSize": ram}, "source_url": url}
                             for model, (ram, url) in REFERENCE_MODELS.items()}}
    return snapshot, public, xml, approval, references


class AvailableBatchReviewTests(unittest.TestCase):
    def test_eleven_ads_preserve_eight_and_exclude_sold_without_writes(self):
        s, p, old, a, r = evidence()
        untouched = deepcopy(s)
        xml, manifest = build_review(s, p, old, a, r)
        self.assertEqual(s, untouched)
        root = ET.fromstring(xml)
        self.assertEqual(len(root), 11)
        self.assertEqual([ET.tostring(ad) for ad in list(root)[:8]], [ET.tostring(ad) for ad in ET.fromstring(old)])
        cases = {ad.findtext("Id"): ad.findtext("CaseCondition") for ad in root}
        self.assertEqual(cases[NEW_IDS["т39"]], "Мелкие царапины")
        self.assertEqual(cases[NEW_IDS["т18"]], "Без дефектов")
        self.assertNotIn(manifest["historical_sold_id_excluded"], cases)
        self.assertFalse(manifest["ready_to_upload"])
        self.assertFalse(manifest["publication_authorized"])
        self.assertFalse(manifest["official_xml_schema_validated"])
        self.assertEqual(manifest["historical_configured_ids_after_release"], 12)
        self.assertFalse(any(root.find('.//' + tag) is not None for tag in ('IMEI', 'Serial', 'Set', 'BoxSealed', 'Margin')))

    def test_approval_is_scoped_to_exact_copy_facts_and_day(self):
        for field, value in (("copy_operator_approved", False), ("publication_authorized", True),
                             ("confirmed_on", "2026-10-09"), ("scope", "facts_only")):
            s, p, x, a, r = evidence()
            a[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                build_review(s, p, x, a, r)

    def test_changed_source_or_shared_gallery_is_rejected(self):
        for change in ('price', 'copy', 'sold', 'identity', 'grade', 'battery', 'gallery', 'kit', 'channel'):
            s, p, x, a, r = evidence()
            item = next(v for v in s['products'] if v['sku'] == 'т39')
            if change == 'price': item['price'] += 1
            if change == 'copy': item['passports'][0]['condition_note'] += ' Изменено.'
            if change == 'sold': item.update(stock_status='sold', stock_quantity=0)
            if change == 'identity': item['inventory'][0]['identity_status'] = 'unmatched'
            if change == 'grade': item['device_details'][0]['grade'] = 'A'
            if change == 'battery': item['device_details'][0]['battery'] = '94%'
            if change == 'gallery': item['listing_file'] = s['products'][0]['listing_file']
            if change == 'kit': item['completeness'] = 'Устройство'
            if change == 'channel': item['listings'][0]['status'] = 'active'
            with self.subTest(change=change), self.assertRaises(ValueError):
                build_review(s, p, x, a, r)

    def test_owner_case_cannot_be_silently_normalized(self):
        s, p, x, a, r = evidence()
        a['entries'][1]['confirmed_phone_attributes']['CaseCondition'] = 'Без дефектов'
        with self.assertRaises(ValueError): build_review(s, p, x, a, r)

    def test_old_sold_stock_cannot_restore_device(self):
        s, p, x, a, r = evidence()
        item = next(v for v in s['products'] if v['sku'] == 'т11')
        item.update(stock_status='available', stock_quantity=1)
        with self.assertRaises(ValueError): build_review(s, p, x, a, r)

    def test_capture_public_evidence_and_reference_guards(self):
        for change in ('capture', 'timestamp', 'redaction', 'ram', 'url', 'physical_confirmation'):
            s, p, x, a, r = evidence()
            if change == 'capture': x += b'\n'
            if change == 'timestamp': p['captured_at'] = '2026-10-09'
            if change == 'redaction': s['private_identifier_redactions'] = 1
            if change == 'ram': r['models']['iPhone 14 Pro']['attributes']['RamSize'] = '8 ГБ'
            if change == 'url': r['models']['iPhone 14 Pro']['source_url'] = 'https://other.invalid'
            if change == 'physical_confirmation': a['entries'][0]['owner_facts_confirmed'] = False
            with self.subTest(change=change), self.assertRaises(ValueError): build_review(s, p, x, a, r)

    def test_historical_binding_and_attributes_cannot_drift(self):
        for change in ('binding', 'model', 'storage', 'color', 'battery'):
            s, p, x, a, r = evidence()
            item = next(v for v in s['products'] if v['sku'] == 'т13')
            if change == 'binding': item['listings'][0]['external_id'] = EXISTING_IDS['т11']
            if change == 'model': item['model'] = 'iPhone 15 Pro Max'
            if change == 'storage': item['device_details'][0]['storage'] = '512 ГБ'
            if change == 'color': item['color'] = 'Deep Purple'
            if change == 'battery': item['device_details'][0]['battery'] = '97%'
            with self.subTest(change=change), self.assertRaises(ValueError): build_review(s, p, x, a, r)

    def test_private_fields_entities_and_duplicate_ids_are_rejected(self):
        for change in ('private', 'entity', 'duplicate'):
            s, p, x, a, r = evidence()
            if change == 'entity':
                x = b'<!DOCTYPE Ads [<!ENTITY invalid "value">]>' + x
            else:
                root = ET.fromstring(x)
                if change == 'private': ET.SubElement(root[0], 'IMEI').text = '123456789012345'
                if change == 'duplicate': root[1].find('Id').text = root[0].findtext('Id')
                x = ET.tostring(root)
            a['existing_feed_sha256'] = hashlib.sha256(x).hexdigest()
            with self.subTest(change=change), self.assertRaises(ValueError): build_review(s, p, x, a, r)


if __name__ == '__main__':
    unittest.main()
