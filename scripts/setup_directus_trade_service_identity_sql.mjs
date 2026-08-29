#!/usr/bin/env node
/** Create the dedicated server-only Trade-in identity without printing its token. */

const rotateToken = process.env.TRADE_SERVICE_ROTATE_TOKEN === "1";
const rehearse = process.argv.includes("--rehearse");

process.stdout.write(String.raw`\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_policy uuid;
  v_user uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name='ISVOI Trade Service' LIMIT 1;
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'ISVOI Trade Service policy is missing';
  END IF;

  SELECT id INTO v_user FROM directus_users WHERE email='trade-service@service.isvoi' LIMIT 1;
  IF v_user IS NULL THEN
    v_user := gen_random_uuid();
    INSERT INTO directus_users(
      id,first_name,last_name,email,title,description,status,role,password,token,provider
    ) VALUES (
      v_user,'ISVOI','Trade Service','trade-service@service.isvoi',
      'Headless Trade-in service',
      'Server-only identity for pricing, quotes and non-personal Trade-in events. No Studio access.',
      'active',NULL,NULL,encode(gen_random_bytes(32),'hex'),'default'
    );
  ELSE
    UPDATE directus_users SET
      first_name='ISVOI',last_name='Trade Service',title='Headless Trade-in service',
      description='Server-only identity for pricing, quotes and non-personal Trade-in events. No Studio access.',
      status='active',role=NULL,password=NULL,
      token=CASE
        WHEN ${rotateToken ? "true" : "false"} OR token IS NULL OR token='' THEN encode(gen_random_bytes(32),'hex')
        ELSE token
      END
    WHERE id=v_user;
  END IF;

  DELETE FROM directus_access WHERE "user"=v_user AND policy<>v_policy;
  IF NOT EXISTS (SELECT 1 FROM directus_access WHERE "user"=v_user AND policy=v_policy) THEN
    INSERT INTO directus_access(id,role,"user",policy,sort)
    VALUES(gen_random_uuid(),NULL,v_user,v_policy,1);
  END IF;
END $$;

${rehearse ? "ROLLBACK;" : "COMMIT;"}

${
  rehearse
    ? `SELECT 'trade.service_identity_rehearsal' AS check_name,'rolled_back' AS value;`
    : `SELECT 'trade.service_identity' AS check_name,count(*)::text AS value
FROM directus_users
WHERE email='trade-service@service.isvoi' AND status='active' AND role IS NULL
  AND password IS NULL AND length(token)>=64
UNION ALL
SELECT 'trade.service_identity_policy',count(*)::text
FROM directus_access access
JOIN directus_users users ON users.id=access."user"
JOIN directus_policies policy ON policy.id=access.policy
WHERE users.email='trade-service@service.isvoi' AND policy.name='ISVOI Trade Service';`
}
`);
