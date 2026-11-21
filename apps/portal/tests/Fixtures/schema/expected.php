<?php

// Story 2.1 (X-15, A-19, ADR-012): the expected portal schema, written by hand from the story's schema
// checklist (docs/laravel-migration/stories/2-1-schema-migrations-and-roles.md), never dumped from a database.
// Column: "<type>[ not null][ default <expr>]" as Postgres prints it. FK: "<column> -> <table>(<column>) on delete <action>".

$uuid = 'uuid not null';
$text = 'text not null';
$textNull = 'text';
$int = 'integer not null';
$ts = 'timestamp(3) without time zone not null';
$tsNull = 'timestamp(3) without time zone';
$tsNow = 'timestamp(3) without time zone not null default CURRENT_TIMESTAMP';
$jsonb = 'jsonb not null';

return [
    'framework' => ['cache', 'cache_locks', 'failed_jobs', 'job_batches', 'jobs', 'migrations'],
    'tables' => [
        'users' => [
            'columns' => ['id' => $uuid, 'name' => $text, 'email' => $text, 'email_verified_at' => $tsNull, 'image' => $textNull, 'password' => $textNull, 'credential_version' => 'integer not null default 0', 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'unique (email)'],
            'foreign' => [],
            'checks' => ['users_normalized_email' => 'CHECK ((email = lower(btrim(email))))'],
        ],
        'sessions' => [
            'columns' => ['id' => 'character varying(255) not null', 'user_id' => 'uuid', 'ip_address' => 'character varying(45)', 'user_agent' => $textNull, 'payload' => $text, 'last_activity' => $int],
            'indexes' => ['primary (id)', 'index (user_id)', 'index (last_activity)'],
            'foreign' => ['user_id -> users(id) on delete cascade'],
        ],
        'profiles' => [
            'columns' => ['id' => $uuid, 'email' => $text, 'full_name' => $textNull, 'first_name' => $textNull, 'last_name' => $textNull, 'is_admin' => 'boolean not null default false', 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'unique (email)'],
            'foreign' => ['id -> users(id) on delete restrict'],
            'checks' => ['profiles_normalized_email' => 'CHECK ((email = lower(btrim(email))))'],
        ],
        'clients' => [
            'columns' => ['id' => $uuid, 'name' => $text, 'slug' => $text, 'billing_email' => $textNull, 'vat_number' => $textNull, 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'unique (slug)'],
            'foreign' => [],
        ],
        'client_memberships' => [
            'columns' => ['id' => $uuid, 'client_id' => $uuid, 'user_id' => $uuid, 'role' => $text, 'created_at' => $tsNow],
            'indexes' => ['primary (id)', 'unique (client_id,user_id)', 'index (user_id)'],
            'foreign' => ['client_id -> clients(id) on delete cascade', 'user_id -> profiles(id) on delete cascade'],
        ],
        'projects' => [
            'columns' => ['id' => $uuid, 'client_id' => $uuid, 'status' => $text, 'package_code' => $text, 'version' => 'integer not null default 0', 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'index (client_id)', 'index (status)'],
            'foreign' => ['client_id -> clients(id) on delete cascade'],
        ],
        'project_briefs' => [
            'columns' => ['id' => $uuid, 'project_id' => $uuid, 'version' => $int, 'answers' => $jsonb, 'created_by' => $uuid, 'created_at' => $tsNow],
            'indexes' => ['primary (id)', 'unique (project_id,version)', 'index (project_id)', 'index (created_by)'],
            'foreign' => ['project_id -> projects(id) on delete cascade', 'created_by -> profiles(id) on delete restrict'],
        ],
        'project_brief_drafts' => [
            'columns' => ['project_id' => $uuid, 'answers' => $jsonb, 'updated_by' => $uuid, 'updated_at' => $ts],
            'indexes' => ['primary (project_id)', 'index (updated_by)'],
            'foreign' => ['project_id -> projects(id) on delete cascade', 'updated_by -> profiles(id) on delete restrict'],
        ],
        'project_orders' => [
            'columns' => ['id' => $uuid, 'project_id' => $uuid, 'client_id' => $uuid, 'status' => $text, 'currency' => $text, 'total_cents' => $int, 'stripe_checkout_session_id' => $textNull, 'stripe_payment_intent_id' => $textNull, 'campaign_slug' => $textNull, 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'unique (stripe_checkout_session_id)', 'unique (stripe_payment_intent_id)', 'index (project_id)', 'index (client_id)'],
            'foreign' => ['project_id -> projects(id) on delete cascade', 'client_id -> clients(id) on delete cascade'],
        ],
        'project_entitlements' => [
            'columns' => ['id' => $uuid, 'project_id' => $uuid, 'key' => $text, 'limit_int' => 'integer', 'consumed_int' => 'integer not null default 0', 'reserved_int' => 'integer not null default 0', 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'unique (project_id,key)', 'index (project_id)'],
            'foreign' => ['project_id -> projects(id) on delete cascade'],
        ],
        'concepts' => [
            'columns' => ['id' => $uuid, 'project_id' => $uuid, 'number' => $int, 'status' => $text, 'notes' => $textNull, 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'unique (project_id,number)', 'index (project_id)', 'index (status)'],
            'foreign' => ['project_id -> projects(id) on delete cascade'],
        ],
        'file_assets' => [
            'columns' => ['id' => $uuid, 'project_id' => $uuid, 'kind' => $text, 'bucket' => $text, 'path' => $text, 'mime' => $text, 'size' => $int, 'notes' => $textNull, 'uploaded_by' => $uuid, 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'index (project_id)', 'index (uploaded_by)'],
            'foreign' => ['project_id -> projects(id) on delete cascade', 'uploaded_by -> profiles(id) on delete restrict'],
        ],
        'message_threads' => [
            'columns' => ['id' => $uuid, 'project_id' => $uuid, 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'unique (project_id)'],
            'foreign' => ['project_id -> projects(id) on delete cascade'],
        ],
        'messages' => [
            'columns' => ['id' => $uuid, 'thread_id' => $uuid, 'project_id' => $uuid, 'sender_id' => $uuid, 'kind' => "text not null default 'user'::text", 'body' => $text, 'created_at' => $tsNow],
            'indexes' => ['primary (id)', 'index (thread_id)', 'index (project_id)', 'index (sender_id)', 'index (created_at)'],
            'foreign' => ['thread_id -> message_threads(id) on delete cascade', 'project_id -> projects(id) on delete cascade', 'sender_id -> profiles(id) on delete restrict'],
        ],
        'revision_requests' => [
            'columns' => ['id' => $uuid, 'project_id' => $uuid, 'concept_id' => 'uuid', 'status' => $text, 'requested_by' => $uuid, 'body' => $text, 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'index (project_id)', 'index (concept_id)', 'index (requested_by)', 'index (status)'],
            'foreign' => ['project_id -> projects(id) on delete cascade', 'concept_id -> concepts(id) on delete set null', 'requested_by -> profiles(id) on delete restrict'],
        ],
        'concept_comments' => [
            'columns' => ['id' => $uuid, 'project_id' => $uuid, 'concept_id' => $uuid, 'author_id' => $uuid, 'body' => $text, 'created_at' => $tsNow],
            'indexes' => ['primary (id)', 'index (project_id,created_at)', 'index (concept_id,created_at)', 'index (author_id)'],
            'foreign' => ['project_id -> projects(id) on delete cascade', 'concept_id -> concepts(id) on delete cascade', 'author_id -> profiles(id) on delete restrict'],
        ],
        'audit_events' => [
            'columns' => ['id' => $uuid, 'project_id' => 'uuid', 'actor_id' => 'uuid', 'type' => $text, 'payload' => $jsonb, 'created_at' => $tsNow],
            'indexes' => ['primary (id)', 'index (project_id,created_at)', 'index (type,created_at)', 'index (actor_id)', "index ((payload ->> 'requestKey'::text))"],
            'foreign' => ['project_id -> projects(id) on delete cascade', 'actor_id -> profiles(id) on delete set null'],
        ],
        'project_read_states' => [
            'columns' => ['id' => $uuid, 'user_id' => $uuid, 'project_id' => $uuid, 'last_seen_messages_at' => $tsNull, 'last_seen_concepts_at' => $tsNull, 'created_at' => $tsNull, 'updated_at' => $tsNull],
            'indexes' => ['primary (id)', 'unique (user_id,project_id)', 'index (project_id)'],
            'foreign' => ['user_id -> profiles(id) on delete cascade', 'project_id -> projects(id) on delete cascade'],
        ],
        'stripe_events' => [
            'columns' => ['event_id' => $text, 'type' => $text, 'created_at' => $ts, 'processed_at' => $tsNull],
            'indexes' => ['primary (event_id)'],
            'foreign' => [],
        ],
        'auth_proofs' => [
            'columns' => ['token_hash' => 'character(64) not null', 'user_id' => $uuid, 'kind' => $text, 'credential_version' => $int, 'expires_at' => $ts],
            'indexes' => ['primary (token_hash)', 'index (user_id)'],
            'foreign' => ['user_id -> users(id) on delete cascade'],
        ],
        'auth_admin_bootstrap' => [
            'columns' => ['id' => $int, 'user_id' => $uuid, 'created_at' => $tsNow],
            'indexes' => ['primary (id)'],
            'foreign' => [],
        ],
        'auth_rate_limits' => [
            'columns' => ['key' => 'character(64) not null', 'hits' => $int, 'window_start' => $ts],
            'indexes' => ['primary (key)', 'index (window_start)'],
            'foreign' => [],
        ],
    ],
    'trigger' => 'CREATE TRIGGER protect_operator_admin_flag BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_operator_admin_flag()',
    // Primary keys that are not a single uuid column (story AC 2).
    'non_uuid_keys' => ['auth_admin_bootstrap' => 'id integer', 'auth_proofs' => 'token_hash character(64)', 'auth_rate_limits' => 'key character(64)', 'sessions' => 'id character varying(255)', 'stripe_events' => 'event_id text'],
];
