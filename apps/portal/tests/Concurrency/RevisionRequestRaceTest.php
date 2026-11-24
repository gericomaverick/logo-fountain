<?php

use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\Project;
use App\Models\ProjectEntitlement;
use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;
use Tests\Support\RaceChildren;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 6.8 AC (C-11, N-12): parallel revision requests can never reserve past the limit.
uses(TruncatesDatabaseAsOwner::class);

afterEach(function () {
    DB::disconnect(DatabaseRoles::RUNTIME);
    DB::disconnect(DatabaseRoles::MIGRATE);
});

it('lets exactly the limit of 6 parallel revision requests win, and queues one admin email each', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    ProjectEntitlement::create(['project_id' => $project->id, 'key' => 'revisions', 'limit_int' => 2, 'consumed_int' => 0, 'reserved_int' => 0]);
    $concept = Concept::factory()->status('published')->create(['project_id' => $project->id]);
    $user = ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;

    $children = RaceChildren::run('revision-request', 6, [$project->id, $user->id, $concept->id], ['ADMIN_NOTIFICATION_EMAILS' => 'ops@example.test', 'POSTMARK_FROM' => 'from@example.test']);

    $won = array_filter($children, fn (array $c) => $c['won']);
    $lost = array_filter($children, fn (array $c) => ! $c['won']);
    expect($won)->toHaveCount(2)
        ->and(array_values(array_unique(array_column($lost, 'code'))))->toBe(['NO_REVISIONS_REMAINING'])
        ->and(DB::table('revision_requests')->count())->toBe(2)
        ->and((int) DB::table('project_entitlements')->value('reserved_int'))->toBe(2)
        ->and(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('REVISIONS_IN_PROGRESS')
        ->and(DB::table('audit_events')->where('type', 'like', 'email_sent:admin_feedback_on_concept:%')->count())->toBe(2);
})->group('pg-race');
