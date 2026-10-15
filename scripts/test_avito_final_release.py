"""Test the exact release contract using a provided private plan, never print its SQL."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import unittest

import activate_avito_expansion as operator
import prepare_avito_final_release as release

PLAN = None
XML = None


class FinalReleaseTests(unittest.TestCase):
    def setUp(self):
        self.plan=deepcopy(PLAN)

    def state(self):
        return {'listings':sorted([{**p['listings'][0],'product':p['id']} for p in self.plan['expected_before']['products']],key=lambda r:r['id']),
          'mapping':{'id':release.MAPPING_ID,'channel':'avito','product_category':release.CATEGORY_ID,
            'external_category':'Телефоны','external_goods_type':'Мобильные телефоны',
            'template_version':self.plan['mapping_version'],'is_active':True,'is_confirmed':True,'default_attributes':{}}}

    def test_exact_contract(self):
        release.validate_plan(self.plan,XML)
        self.assertEqual((len(release.ALL_IDS),len(release.NEW),release.BATCH_SIZE),(17,2,2))

    def test_historical_default_still_refuses_two(self):
        with self.assertRaises(ValueError):
            operator.transaction_sql(self.plan,self.state(),XML,identities=release.IDENTITIES,new_rows=release.NEW)

    def test_explicit_two_row_sql_and_rollback(self):
        before=self.state()
        sql=operator.transaction_sql(self.plan,before,XML,identities=release.IDENTITIES,new_rows=release.NEW,
            expected_count=2,extra_guard_sql=release.transaction_guards(self.plan))
        self.assertTrue('IF changed<>2' in sql)
        self.assertTrue(sql.endswith('ROLLBACK;'))
        active=deepcopy(before)
        for row in active['listings']:
            for desired in self.plan['desired']:
                if row['id']==desired['id']:row.update(desired)
        receipt={'xml_sha256':self.plan['xml_sha256'],'before':before,
            'after':[r for r in active['listings'] if r['external_id'] in release.NEW]}
        with self.assertRaises(ValueError):operator.rollback_sql(self.plan,active,receipt,release.NEW)
        rollback=operator.rollback_sql(self.plan,active,receipt,release.NEW,expected_count=2)
        self.assertTrue('IF changed<>2' in rollback)

    def test_wrong_count_and_inventory_drift(self):
        for count in (0,1,3,4):
            with self.subTest(count=count), self.assertRaises(ValueError):
                operator.transaction_sql(self.plan,self.state(),XML,identities=release.IDENTITIES,new_rows=release.NEW,expected_count=count)
        for key,value in [('price',1),('stock_quantity',0)]:
            saved=deepcopy(self.plan)
            self.plan['expected_before']['products'][0][key]=value
            with self.assertRaises(ValueError):release.validate_plan(self.plan,XML)
            self.plan=saved

    def test_physical_facts_and_proof_scope_fail_closed(self):
        self.plan['physical_confirmation']['functions_working']=False
        with self.assertRaises(ValueError):release.validate_plan(self.plan,XML)
        self.plan=deepcopy(PLAN)
        self.plan['cash_stock_approvals']['entries'].pop(next(iter(release.NEW)))
        with self.assertRaises(ValueError):release.validate_plan(self.plan,XML)

    def test_exact_authorization_and_batch_waiver(self):
        authorization={'source':'owner_release_authorization','authorized':True,'scope':'sixteen_cash_ad_live_feed_expansion',
            'xml_sha256':release.APPROVED_HASH,'allowed_ids':release.ALL_IDS,'no_unapproved_extra_costs':True}
        waiver={'source':'owner_confirmation','xml_sha256':release.APPROVED_HASH,'kind':'explicit_72h_waiver','waived':True}
        release.require_authorization(self.plan,authorization,waiver)
        for field,value in [('scope','fourteen_cash_ad_live_feed_expansion'),('authorized',False)]:
            changed={**authorization,field:value}
            with self.assertRaises(ValueError):release.require_authorization(self.plan,changed,waiver)
        with self.assertRaises(ValueError):release.require_authorization(self.plan,authorization,{**waiver,'waived':False})


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--plan',required=True);parser.add_argument('--xml',required=True)
    args=parser.parse_args()
    PLAN=json.loads(Path(args.plan).read_text(encoding='utf-8'));XML=Path(args.xml).read_bytes()
    unittest.main(argv=['test_avito_final_release'])
