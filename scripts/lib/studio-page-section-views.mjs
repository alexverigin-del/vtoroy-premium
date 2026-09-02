// Studio 11.17 only reads bookmark/archive from collection URLs, not filter.
// These global bookmarks belong to the hidden child collection; personal presets stay untouched.
export const pageSectionViewsSql = `
DO $$ DECLARE p record; active boolean; preset_id integer; links jsonb; rules jsonb='[]'::jsonb; row_filter jsonb; label text; BEGIN
 FOR p IN SELECT id,editor_label FROM site_pages ORDER BY id LOOP
  links='[]'::jsonb;
  FOREACH active IN ARRAY ARRAY[true,false] LOOP
   row_filter=jsonb_build_object('page',jsonb_build_object('_eq',p.id::text),'is_active',jsonb_build_object('_eq',active));
   label=CASE WHEN active THEN 'Действующие блоки' ELSE 'Отключённые блоки' END;
   SELECT id INTO preset_id FROM directus_presets WHERE collection='page_sections' AND "user" IS NULL AND role IS NULL
    AND bookmark LIKE 'Блоки: %' AND filter::jsonb=row_filter ORDER BY id LIMIT 1;
   IF preset_id IS NULL THEN
    INSERT INTO directus_presets(collection,bookmark,layout,filter,icon) VALUES
     ('page_sections','Блоки: '||p.editor_label||' · '||label,'tabular',row_filter,CASE WHEN active THEN 'visibility' ELSE 'visibility_off' END)
    RETURNING id INTO preset_id;
   END IF;
   UPDATE directus_presets SET bookmark='Блоки: '||p.editor_label||' · '||label,layout='tabular',filter=row_filter,
    layout_query='{"tabular":{"fields":["editor_label","headline","is_active","sort_order"],"sort":["sort_order"],"limit":50}}',
    layout_options='{"tabular":{"spacing":"comfortable","widths":{"editor_label":230,"headline":420,"is_active":120,"sort_order":100}}}'
   WHERE id=preset_id;
   links=links||jsonb_build_array(jsonb_build_object('label',label,'icon',CASE WHEN active THEN 'visibility' ELSE 'visibility_off' END,
    'type',CASE WHEN active THEN 'primary' ELSE 'normal' END,'actionType','url','url','/content/page_sections?bookmark='||preset_id));
  END LOOP;
  rules=rules||jsonb_build_array(jsonb_build_object('name','Блоки: '||p.editor_label,'rule',jsonb_build_object('id',jsonb_build_object('_eq',p.id::text)),
   'hidden',false,'options',jsonb_build_object('links',links)));
 END LOOP;
 UPDATE directus_fields SET options='{"links":[]}',hidden=true,conditions=rules,
  note='Сохранённые списки этой страницы. Полный порядок доступен в «Все блоки и порядок». После добавления новой страницы оператор обновляет Studio setup.'
 WHERE collection='site_pages' AND field='section_views';
END $$;
`;
