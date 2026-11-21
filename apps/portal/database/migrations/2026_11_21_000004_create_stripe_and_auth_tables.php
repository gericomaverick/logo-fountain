<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Story 2.1 (X-15, ADR-012): Stripe event ledger and the auth tables (proofs, admin bootstrap, rate-limit buckets).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stripe_events', function (Blueprint $table) {
            $table->text('event_id')->primary();
            $table->text('type'); // also holds the processing: lease marker
            $table->timestamp('created_at', 3); // the Stripe event time, no default
            $table->timestamp('processed_at', 3)->nullable();
        });

        Schema::create('auth_proofs', function (Blueprint $table) {
            $table->char('token_hash', 64)->primary();
            $table->foreignUuid('user_id')->index()->constrained()->cascadeOnDelete();
            $table->text('kind');
            $table->integer('credential_version');
            $table->timestamp('expires_at', 3);
        });

        // Operator table (A-12, story 4.9a): db:grants revokes every runtime privilege on it. No FK and
        // no single-row CHECK (owner decision 8): the bootstrap CLI always writes id = 1.
        Schema::create('auth_admin_bootstrap', function (Blueprint $table) {
            $table->integer('id')->primary();
            $table->uuid('user_id');
            $table->timestamp('created_at', 3)->useCurrent();
        });

        Schema::create('auth_rate_limits', function (Blueprint $table) {
            $table->char('key', 64)->primary();
            $table->integer('hits');
            $table->timestamp('window_start', 3)->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth_rate_limits');
        Schema::dropIfExists('auth_admin_bootstrap');
        Schema::dropIfExists('auth_proofs');
        Schema::dropIfExists('stripe_events');
    }
};
