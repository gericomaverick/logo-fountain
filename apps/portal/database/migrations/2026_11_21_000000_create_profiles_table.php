<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Story 2.1 (X-15, A-19): profiles (Next Profile), its email check and the operator-owned admin-flag trigger.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profiles', function (Blueprint $table) {
            // A profile's id is its user's id (no default, schema.prisma:13,22).
            $table->uuid('id')->primary();
            $table->foreign('id')->references('id')->on('users')->restrictOnDelete();
            $table->text('email')->unique();
            $table->text('full_name')->nullable();
            $table->text('first_name')->nullable();
            $table->text('last_name')->nullable();
            $table->boolean('is_admin')->default(false);
            $table->timestamps(3);
        });
        DB::statement('ALTER TABLE profiles ADD CONSTRAINT profiles_normalized_email CHECK (email = lower(btrim(email)))');

        // Only the table owner (the migrate role) may insert an admin or change the flag (migration.sql:525-538).
        // Hardened vs Next: catalog names are schema-qualified and search_path is pinned, so a session that can
        // create temporary tables can't shadow pg_class with its own (pg_temp is searched first for relations).
        // CREATE OR REPLACE: migrate:fresh drops tables but not functions.
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION protect_operator_admin_flag() RETURNS trigger LANGUAGE plpgsql
            SET search_path = pg_catalog, pg_temp AS $$
            BEGIN
              IF (TG_OP = 'INSERT' AND NEW.is_admin) OR
                 (TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
                IF current_user <> pg_catalog.pg_get_userbyid((SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID)) THEN
                  RAISE EXCEPTION 'operator-owned admin flag';
                END IF;
              END IF;
              RETURN NEW;
            END $$;
            DROP TRIGGER IF EXISTS protect_operator_admin_flag ON profiles;
            CREATE TRIGGER protect_operator_admin_flag BEFORE INSERT OR UPDATE ON profiles
            FOR EACH ROW EXECUTE FUNCTION protect_operator_admin_flag();
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('profiles');
        DB::statement('DROP FUNCTION IF EXISTS protect_operator_admin_flag()');
    }
};
