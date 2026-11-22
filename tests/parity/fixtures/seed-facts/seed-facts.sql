-- Seed facts (story 2.6, O-02): the logical facts a parity seed must produce, one line per fact, in a fixed
-- order. Shared by both apps: run it after the app's wrapper, which defines the f_* temporary views over that
-- app's own tables (seed-facts-laravel.sql, seed-facts-next.sql). One psql session, read-only:
--   psql "$URL" -X -At -v ON_ERROR_STOP=1 -f seed-facts-<app>.sql -f seed-facts.sql
-- Ids are compared as-is (both seeders derive them from sha256("<scenario>:<kind>:<key>")); timestamps never
-- are, only the order they give (state changes). Text sorts with COLLATE "C" so the order is byte order.
SELECT fact || '|' || value AS line FROM (
  SELECT 1 AS o, 'users' AS fact, count(*)::text AS value FROM f_user
  UNION ALL SELECT 2, 'users.verified', count(*) FILTER (WHERE verified)::text FROM f_user
  UNION ALL SELECT 3, 'users.password', count(*) FILTER (WHERE has_password)::text FROM f_user
  UNION ALL SELECT 4, 'profiles', count(*)::text FROM f_profile
  UNION ALL SELECT 5, 'profiles.admin', count(*) FILTER (WHERE is_admin)::text FROM f_profile
  UNION ALL SELECT 6, 'admin_bootstrap', coalesce(string_agg(user_id::text, ',' ORDER BY user_id::text COLLATE "C"), 'none') FROM f_admin_bootstrap
  UNION ALL SELECT 7, 'projects.status:' || status, count(*)::text FROM f_project GROUP BY status
  UNION ALL SELECT 8, 'project:' || p.id::text || ':memberships', coalesce((
    SELECT string_agg(m.user_id::text, ',' ORDER BY m.user_id::text COLLATE "C") FROM f_membership m WHERE m.project_id = p.id), 'none') FROM f_project p
  UNION ALL SELECT 8, 'project:' || p.id::text || ':state_changed', coalesce((
    SELECT string_agg(coalesce(s.previous_status, '-') || '>' || s.next_status || coalesce('@' || s.actor_id::text, ''), ',' ORDER BY s.at, s.id::text COLLATE "C")
    FROM f_state_change s WHERE s.project_id = p.id), 'none') FROM f_project p
  UNION ALL SELECT 8, 'project:' || e.project_id::text || ':entitlement:' || e.key,
    coalesce(e.limit_int::text, 'null') || ',' || e.consumed_int::text || ',' || e.reserved_int::text FROM f_entitlement e
  UNION ALL SELECT 8, 'project:' || p.id::text || ':orders', coalesce((
    SELECT string_agg(r.status || ':' || r.total_cents::text, ',' ORDER BY r.status COLLATE "C", r.total_cents) FROM f_order r WHERE r.project_id = p.id), 'none') FROM f_project p
  UNION ALL SELECT 8, 'project:' || p.id::text || ':briefs', (SELECT count(*) FROM f_brief b WHERE b.project_id = p.id)::text FROM f_project p
  UNION ALL SELECT 8, 'project:' || p.id::text || ':brief_drafts', (SELECT count(*) FROM f_brief_draft d WHERE d.project_id = p.id)::text FROM f_project p
  UNION ALL SELECT 8, 'project:' || p.id::text || ':concepts', coalesce((
    SELECT string_agg(c.number::text || ':' || c.status, ',' ORDER BY c.number) FROM f_concept c WHERE c.project_id = p.id), 'none') FROM f_project p
  UNION ALL SELECT 8, 'project:' || p.id::text || ':file_assets', coalesce((
    SELECT string_agg(a.kind, ',' ORDER BY a.kind COLLATE "C") FROM f_file_asset a WHERE a.project_id = p.id), 'none') FROM f_project p
  UNION ALL SELECT 8, 'project:' || p.id::text || ':revisions', coalesce((
    SELECT string_agg(v.status, ',' ORDER BY v.status COLLATE "C") FROM f_revision v WHERE v.project_id = p.id), 'none') FROM f_project p
  UNION ALL SELECT 8, 'project:' || p.id::text || ':comments', (SELECT count(*) FROM f_comment c WHERE c.project_id = p.id)::text FROM f_project p
  UNION ALL SELECT 8, 'project:' || p.id::text || ':messages', coalesce((
    SELECT string_agg(g.kind, ',' ORDER BY g.at, g.id::text COLLATE "C") FROM f_message g WHERE g.project_id = p.id), 'none') FROM f_project p
) facts
ORDER BY o, fact COLLATE "C";
