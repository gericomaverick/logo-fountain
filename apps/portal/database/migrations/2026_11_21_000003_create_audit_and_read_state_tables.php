<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Story 2.1 (X-15, ADR-012): the audit/idempotency store (with the requestKey expression index) and read states.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('project_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignUuid('actor_id')->nullable()->index()->constrained('profiles')->nullOnDelete();
            $table->text('type');
            $table->jsonb('payload');
            $table->timestamp('created_at', 3)->useCurrent();
            $table->index(['project_id', 'created_at']);
            $table->index(['type', 'created_at']);
        });
        // ADR-012: receipt lookups (7.5a) must query payload->>'requestKey' = ? to use this index.
        DB::statement("CREATE INDEX audit_events_payload_request_key_index ON audit_events ((payload->>'requestKey'))");

        Schema::create('project_read_states', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('profiles')->cascadeOnDelete();
            $table->foreignUuid('project_id')->index()->constrained()->cascadeOnDelete();
            $table->timestamp('last_seen_messages_at', 3)->nullable();
            $table->timestamp('last_seen_concepts_at', 3)->nullable();
            $table->timestamps(3);
            $table->unique(['user_id', 'project_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_read_states');
        Schema::dropIfExists('audit_events');
    }
};
