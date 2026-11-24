<?php

use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\Project;
use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;
use Tests\Support\RaceChildren;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 6.9 AC (C-12, N-07, N-08): two parallel approvals of different concepts; exactly one wins, each email once.
uses(TruncatesDatabaseAsOwner::class);

afterEach(function () {
    DB::disconnect(DatabaseRoles::RUNTIME);
    DB::disconnect(DatabaseRoles::MIGRATE);
});

it('lets exactly one of two parallel approvals win and sends each approval email once', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $concepts = collect([1, 2])->map(fn (int $n) => Concept::factory()->status('published')->create(['project_id' => $project->id, 'number' => $n]));
    $user = ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;

    $children = RaceChildren::runMixed(
        $concepts->map(fn (Concept $c) => ['approve', [$project->id, $user->id, $c->id]])->all(),
        ['ADMIN_NOTIFICATION_EMAILS' => 'ops@example.test', 'POSTMARK_FROM' => 'from@example.test'],
    );

    $won = array_values(array_filter($children, fn (array $c) => $c['won']));
    $lost = array_values(array_filter($children, fn (array $c) => ! $c['won']));
    expect($won)->toHaveCount(1)
        ->and($lost)->toHaveCount(1)
        ->and($lost[0]['code'])->toBe('CONCEPT_NOT_FOUND')
        ->and(DB::table('concepts')->where('project_id', $project->id)->where('status', 'approved')->count())->toBe(1)
        ->and(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('AWAITING_APPROVAL')
        ->and(DB::table('audit_events')->where('type', 'like', 'email_sent:client_concept_approved:%')->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'like', 'email_sent:admin_concept_approved:%')->count())->toBe(1);
})->group('pg-race');
