<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Story 2.1 (X-15, ADR-012): clients, memberships, projects and the project-owned brief, order and entitlement tables.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clients', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->text('name');
            $table->text('slug')->unique();
            $table->text('billing_email')->nullable();
            $table->text('vat_number')->nullable();
            $table->timestamps(3);
        });

        Schema::create('client_memberships', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('client_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->index()->constrained('profiles')->cascadeOnDelete();
            $table->text('role');
            $table->timestamp('created_at', 3)->useCurrent();
            $table->unique(['client_id', 'user_id']);
        });

        Schema::create('projects', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('client_id')->index()->constrained()->cascadeOnDelete();
            $table->text('status')->index();
            $table->text('package_code');
            $table->integer('version')->default(0); // ADR-011 optimistic version (story 2.4)
            $table->timestamps(3);
        });

        Schema::create('project_briefs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('project_id')->index()->constrained()->cascadeOnDelete();
            $table->integer('version');
            $table->jsonb('answers');
            $table->foreignUuid('created_by')->index()->constrained('profiles')->restrictOnDelete();
            $table->timestamp('created_at', 3)->useCurrent();
            $table->unique(['project_id', 'version']);
        });

        Schema::create('project_brief_drafts', function (Blueprint $table) {
            $table->foreignUuid('project_id')->primary()->constrained()->cascadeOnDelete();
            $table->jsonb('answers');
            $table->foreignUuid('updated_by')->index()->constrained('profiles')->restrictOnDelete();
            $table->timestamp('updated_at', 3);
        });

        Schema::create('project_orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('project_id')->index()->constrained()->cascadeOnDelete();
            $table->foreignUuid('client_id')->index()->constrained()->cascadeOnDelete();
            $table->text('status');
            $table->text('currency');
            $table->integer('total_cents');
            $table->text('stripe_checkout_session_id')->nullable()->unique();
            $table->text('stripe_payment_intent_id')->nullable()->unique();
            $table->text('campaign_slug')->nullable();
            $table->timestamps(3);
        });

        Schema::create('project_entitlements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('project_id')->index()->constrained()->cascadeOnDelete();
            $table->text('key');
            $table->integer('limit_int')->nullable();
            $table->integer('consumed_int')->default(0);
            $table->integer('reserved_int')->default(0);
            $table->timestamps(3);
            $table->unique(['project_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_entitlements');
        Schema::dropIfExists('project_orders');
        Schema::dropIfExists('project_brief_drafts');
        Schema::dropIfExists('project_briefs');
        Schema::dropIfExists('projects');
        Schema::dropIfExists('client_memberships');
        Schema::dropIfExists('clients');
    }
};
