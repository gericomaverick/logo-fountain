<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Story 2.1 (X-15, A-19, ADR-012): users = Next AuthUser (uuid id, password moved from AuthAccount,
// Laravel email_verified_at) and Laravel's database sessions keyed by the uuid user. No
// password_reset_tokens or remember_token (owner decision 4: ADR-006 proofs, no "remember me").
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->text('name');
            $table->text('email')->unique();
            $table->timestamp('email_verified_at', 3)->nullable();
            $table->text('image')->nullable();
            $table->text('password')->nullable();
            $table->integer('credential_version')->default(0);
            $table->timestamps(3);
        });
        // A-19: the database refuses an un-normalised identity, from every role (migration.sql:522).
        DB::statement('ALTER TABLE users ADD CONSTRAINT users_normalized_email CHECK (email = lower(btrim(email)))');

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignUuid('user_id')->nullable()->index()->constrained()->cascadeOnDelete();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('users');
    }
};
