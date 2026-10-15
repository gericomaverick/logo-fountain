# Historical Supabase lineage — archival only

These files are preserved byte-for-byte from `ef4190d1be1f752e072e28e89255d98fd61ed4a2`. They are **not** the active migration path and must not be replayed on the portable PostgreSQL installation. In particular the historical hardening migration references Supabase roles and forces RLS without portable policies.

The new active lineage begins with `20260901000000_portable_core`. This is a fresh, disposable-data installation baseline, not a claim that old migrations were deployed elsewhere or a live migration/rebase procedure. No existing `_prisma_migrations` records are edited or baselined by this change. Supabase records/accounts/objects are not transferred or deleted here. Auth models will require their own subsequent portable migration before the full exit is complete.
