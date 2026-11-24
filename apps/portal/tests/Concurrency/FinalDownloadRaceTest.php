<?php

use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\FileAsset;
use App\Models\Project;
use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;
use Tests\Support\RaceChildren;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 6.11 AC 2 and 4 (C-13): parallel first downloads make one DELIVERED transition and one audit event. By design the
// loser of the version guard either retries inside Db::serializable and is served the DELIVERED project with a URL, or
// ends as a 409 FINAL_DOWNLOAD_CONFLICT with no URL; nothing else is allowed.
uses(TruncatesDatabaseAsOwner::class);

afterEach(function () {
    DB::disconnect(DatabaseRoles::RUNTIME);
    DB::disconnect(DatabaseRoles::MIGRATE);
});

it('moves FINAL_FILES_READY to DELIVERED once with one audit event when two downloads race', function () {
    $project = Project::factory()->create(['status' => 'FINAL_FILES_READY']);
    Concept::factory()->status('approved')->create(['project_id' => $project->id]);
    FileAsset::factory()->create(['project_id' => $project->id, 'kind' => 'final_zip', 'bucket' => 'final-deliverables', 'path' => "{$project->id}/finals/a.zip"]);
    $user = ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
    $version = (int) DB::table('projects')->where('id', $project->id)->value('version');

    $children = RaceChildren::run('final-download', 2, [$project->id, $user->id]);

    $won = array_values(array_filter($children, fn (array $c) => $c['won']));
    $lost = array_values(array_filter($children, fn (array $c) => ! $c['won']));
    expect($won)->not->toBeEmpty()
        ->and(array_values(array_unique(array_column($lost, 'code'))))->toBeIn([[], ['FINAL_DOWNLOAD_CONFLICT']])
        ->and(array_filter(array_column($lost, 'url')))->toBeEmpty()
        ->and(array_filter(array_column($won, 'url'), fn ($u) => is_string($u) && str_contains($u, '/finals-bkt/')))->toHaveCount(count($won))
        ->and(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('DELIVERED')
        ->and((int) DB::table('projects')->where('id', $project->id)->value('version'))->toBe($version + 1)
        ->and(DB::table('audit_events')->where('type', 'state_changed')->where('project_id', $project->id)->count())->toBe(1);
})->group('pg-race');
