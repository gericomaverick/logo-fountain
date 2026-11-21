<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Story 2.1 (X-15, ADR-012): concepts, file assets, message threads and messages, revision requests and concept comments.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('concepts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('project_id')->index()->constrained()->cascadeOnDelete();
            $table->integer('number');
            $table->text('status')->index();
            $table->text('notes')->nullable();
            $table->timestamps(3);
            $table->unique(['project_id', 'number']);
        });

        Schema::create('file_assets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('project_id')->index()->constrained()->cascadeOnDelete();
            $table->text('kind');
            $table->text('bucket');
            $table->text('path');
            $table->text('mime');
            $table->integer('size');
            $table->text('notes')->nullable();
            $table->foreignUuid('uploaded_by')->index()->constrained('profiles')->restrictOnDelete();
            $table->timestamps(3);
        });

        Schema::create('message_threads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('project_id')->unique()->constrained()->cascadeOnDelete();
            $table->timestamps(3);
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('thread_id')->index()->constrained('message_threads')->cascadeOnDelete();
            $table->foreignUuid('project_id')->index()->constrained()->cascadeOnDelete();
            $table->foreignUuid('sender_id')->index()->constrained('profiles')->restrictOnDelete();
            $table->text('kind')->default('user');
            $table->text('body');
            $table->timestamp('created_at', 3)->useCurrent()->index();
        });

        Schema::create('revision_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('project_id')->index()->constrained()->cascadeOnDelete();
            $table->foreignUuid('concept_id')->nullable()->index()->constrained()->nullOnDelete();
            $table->text('status')->index();
            $table->foreignUuid('requested_by')->index()->constrained('profiles')->restrictOnDelete();
            $table->text('body');
            $table->timestamps(3);
        });

        Schema::create('concept_comments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('project_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('concept_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('author_id')->index()->constrained('profiles')->restrictOnDelete();
            $table->text('body');
            $table->timestamp('created_at', 3)->useCurrent();
            $table->index(['project_id', 'created_at']);
            $table->index(['concept_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('concept_comments');
        Schema::dropIfExists('revision_requests');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('message_threads');
        Schema::dropIfExists('file_assets');
        Schema::dropIfExists('concepts');
    }
};
