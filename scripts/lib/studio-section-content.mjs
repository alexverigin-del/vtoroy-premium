// to_jsonb(row) keeps audits compatible with databases before the additive migration.
export function effectiveSectionContentSql(alias) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  const row = `to_jsonb(${alias})`;
  return `(coalesce(${alias}.content::jsonb,'{}'::jsonb)
    || CASE WHEN jsonb_typeof(${row}->'editor_note')='string' THEN jsonb_build_object('note',${row}->'editor_note') ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(${row}->'editor_disclaimer')='string' THEN jsonb_build_object('disclaimer',${row}->'editor_disclaimer') ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(${row}->'editor_steps')='array' THEN jsonb_build_object('steps',${row}->'editor_steps') ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(${row}->'editor_proof')='array' THEN jsonb_build_object('proof',coalesce((SELECT jsonb_agg(item->'text' ORDER BY ord) FROM jsonb_array_elements(${row}->'editor_proof') WITH ORDINALITY AS p(item,ord)),'[]'::jsonb)) ELSE '{}'::jsonb END)`;
}

// Materialize once: expanding a composite expression inside large UNION audits
// makes PostgreSQL planning needlessly expensive. Only session-local data changes.
export const sectionAuditViewSql = `DROP TABLE IF EXISTS pg_temp.page_sections;
CREATE TEMP TABLE page_sections AS SELECT * FROM public.page_sections;
UPDATE pg_temp.page_sections s SET content=${effectiveSectionContentSql("s")};
ANALYZE pg_temp.page_sections;`;
