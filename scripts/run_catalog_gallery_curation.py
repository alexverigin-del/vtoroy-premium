"""Server-only media rollout: verified backup, temporary identity, invariant checks.

Run on Beget through SSH. Tokens never leave the server or appear in logs.
No application deployment or marketplace operation is performed.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError

DB = ["docker", "exec", "-i", "directus-beget-database-1", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "isvoi", "-d", "isvoi", "-At"]
TABLES = ["products", "product_offers", "device_details", "accessory_details", "device_passports", "device_diagnostic_reports",
          "inventory_items", "inventory_import_issues", "inventory_receipt_lines", "catalog_sections",
          "product_categories", "product_brands", "device_models", "device_model_specifications", "product_compatible_models",
          "product_types", "product_channel_listings", "channel_cost_profiles", "channel_category_mappings"]


def sql(query):
    return subprocess.run(DB, input=query, text=True, capture_output=True, check=True).stdout.strip()


def invariants():
    result = {}
    for table in TABLES:
        if sql(f"SELECT to_regclass('public.{table}') IS NOT NULL;") == "t":
            result[table] = sql(f'SELECT count(*)::text || \':\' || md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,\'null\')) FROM "{table}" t;')
    return result


def backup(repo):
    folder = repo / "backups/directus" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-gallery")
    folder.mkdir(mode=0o700, parents=True)
    dump = subprocess.Popen(["docker", "exec", "directus-beget-database-1", "pg_dump", "-U", "isvoi", "-d", "isvoi"], stdout=subprocess.PIPE)
    with gzip.open(folder / "postgres.sql.gz", "wb", compresslevel=9) as target:
        shutil.copyfileobj(dump.stdout, target)
    dump.stdout.close()
    if dump.wait() != 0:
        raise RuntimeError("Database backup failed")
    subprocess.run(["tar", "-C", str(repo / "infra/directus-beget"), "-czf", str(folder / "uploads.tar.gz"), "uploads"], check=True)
    sums = []
    for name in ["postgres.sql.gz", "uploads.tar.gz"]:
        digest = hashlib.sha256()
        with (folder / name).open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        sums.append(f"{digest.hexdigest()}  {name}")
    (folder / "SHA256SUMS").write_text("\n".join(sums)+"\n")
    subprocess.run(["gzip", "-t", "postgres.sql.gz"], cwd=folder, check=True)
    subprocess.run(["tar", "-tzf", "uploads.tar.gz"], cwd=folder, stdout=subprocess.DEVNULL, check=True)
    subprocess.run(["sha256sum", "-c", "SHA256SUMS"], cwd=folder, check=True)
    return folder


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="/opt/isvoi")
    parser.add_argument("--bundle")
    parser.add_argument("--backup-only", action="store_true")
    parser.add_argument("--backup-dir")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    parser.add_argument("--resume-prepared", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    repo = Path(args.repo).resolve()
    if repo != Path("/opt/isvoi"):
        raise ValueError("This runner is scoped to /opt/isvoi")
    if args.backup_only:
        print(json.dumps({"verified_backup": str(backup(repo))}))
        return
    if not args.bundle or not args.backup_dir or (args.apply and args.rollback):
        raise ValueError("Bundle and verified backup required; choose one mutation mode")
    bundle, backup_dir = Path(args.bundle).resolve(), Path(args.backup_dir).resolve()
    if not backup_dir.is_relative_to(repo / "backups/directus") or not bundle.is_relative_to(backup_dir):
        raise ValueError("Release bundle must be inside verified VPS backup")
    subprocess.run(["sha256sum", "-c", "SHA256SUMS"], cwd=backup_dir, check=True)
    if sql("SELECT count(*) FROM directus_users WHERE email='catalog-release-qa@service.isvoi';") != "0":
        raise RuntimeError("Release identity already exists; do not rotate another run's token")
    before = invariants()
    (bundle / "protected-invariants-before.json").write_text(json.dumps(before, indent=2)+"\n")
    token = None
    try:
        create = subprocess.run(["node", str(bundle / "identity-sql.mjs")], capture_output=True, text=True, check=True).stdout
        sql(create)
        token = sql("SELECT token FROM directus_users WHERE email='catalog-release-qa@service.isvoi';")
        env = {**os.environ, "DIRECTUS_URL":"http://127.0.0.1:8055", "DIRECTUS_TOKEN":token}
        command = ["node", str(bundle / "apply.mjs"), str(bundle / "gallery-curation.json")]
        if args.apply:
            command.append("--apply")
        if args.rollback:
            command.append("--rollback")
        if args.resume_prepared:
            command.append("--resume-prepared")
        subprocess.run(command, env=env, check=True)
        after = invariants()
        (bundle / "protected-invariants-after.json").write_text(json.dumps(after, indent=2)+"\n")
        if before != after:
            raise RuntimeError("Protected business data changed; inspect private evidence before continuing")
        print(json.dumps({"protected_tables_unchanged":len(before)}))
        if args.apply or args.rollback:
            code = "const r=await fetch('http://127.0.0.1:3000/api/revalidate/site-content',{method:'POST',headers:{'x-isvoi-revalidate-secret':process.env.SITE_REVALIDATION_SECRET}}); if(!r.ok)throw Error('Revalidation HTTP '+r.status); const j=await r.json(); console.log(JSON.stringify({site_revalidated:j.ok,scope:j.scope}));"
            subprocess.run(["node", "--env-file="+str(repo / "apps/web/.env.local"), "--input-type=module", "-e", code], check=True)
    finally:
        delete = subprocess.run(["node", str(bundle / "identity-sql.mjs")], env={**os.environ,"CATALOG_RELEASE_IDENTITY_MODE":"delete"}, capture_output=True, text=True, check=True).stdout
        sql(delete)
        if sql("SELECT count(*) FROM directus_users WHERE email='catalog-release-qa@service.isvoi';") != "0":
            raise RuntimeError("Temporary identity removal failed")
        if token:
            try:
                urlopen(Request("http://127.0.0.1:8055/users/me", headers={"Authorization":"Bearer "+token}), timeout=30)
                raise RuntimeError("Removed token is still usable")
            except HTTPError as error:
                if error.code != 401:
                    raise RuntimeError("Unexpected token revocation response") from error
        print(json.dumps({"temporary_identity_removed":True,"token_revoked":True}))


if __name__ == "__main__":
    main()
