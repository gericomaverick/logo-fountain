<?php

use App\Models\Client;
use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\FileAsset;
use App\Models\Profile;
use App\Models\Project;
use App\Support\DatabaseRoles;
use App\Support\Storage\PrivateStorage;
use Aws\MockHandler;
use Aws\S3\S3Client;
use Illuminate\Support\Facades\DB;
use Tests\Support\SessionRows;
use Tests\Support\StorageTestClient as T;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.11 (C-13): final ZIP download. Compared with the Next route `projects/[id]/finals/route.ts` and `route.test.ts`.
// Signing is local (SigV4 against a mock S3 client): no network, never live storage.

beforeEach(function () {
    config(['session.driver' => 'database', 'portal.public_site_url' => 'https://portal.example.test']);
    app()->instance(PrivateStorage::class, new PrivateStorage(new S3Client(T::options(new MockHandler([]))), 'concepts-bkt', 'finals-bkt'));
    test()->withHeaders(['Origin' => 'https://portal.example.test']);
});

afterEach(fn () => DB::disconnect());

function fnSignIn($user): void
{
    $sid = substr(hash('sha256', $user->id.microtime()), 0, 40);
    SessionRows::insert($sid, $user->id, time(), time(), true);
    test()->flushSession();
    test()->withCredentials()->withCookie(config('session.cookie'), $sid);
}

/** @return array{0: Project, 1: Profile} a project with an approved concept and a final ZIP, plus its member */
function fnProject(string $status = 'FINAL_FILES_READY', string $company = 'Acme Ltd'): array
{
    $project = Project::factory()->for(Client::factory()->state(['name' => $company]))->create(['status' => $status]);
    Concept::factory()->status('approved')->create(['project_id' => $project->id]);
    fnFinal($project, 'a', '2026-03-05 08:00:00');
    $member = ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile;

    return [$project, $member];
}

function fnFinal(Project $project, string $name, string $at): FileAsset
{
    return FileAsset::factory()->create(['project_id' => $project->id, 'kind' => 'final_zip', 'bucket' => 'final-deliverables',
        'path' => "{$project->id}/finals/{$name}.zip", 'created_at' => $at]);
}

function fnQuery(string $url): array
{
    parse_str((string) parse_url($url, PHP_URL_QUERY), $q);

    return $q;
}

it('signs the newest final ZIP with the brand-date disposition and moves FINAL_FILES_READY to DELIVERED once', function () {
    [$project, $member] = fnProject();
    fnFinal($project, 'newest', '2026-03-09 10:00:00');
    fnFinal($project, 'older', '2026-03-01 10:00:00');
    fnSignIn($member->user);
    $version = (int) DB::table('projects')->where('id', $project->id)->value('version');

    $res = $this->postJson("/api/projects/{$project->id}/finals")->assertOk()->assertJsonStructure(['url']);
    $url = $res->json('url');
    $q = fnQuery($url);
    expect(parse_url($url, PHP_URL_PATH))->toBe("/finals-bkt/{$project->id}/finals/newest.zip")
        ->and($q['X-Amz-Expires'])->toBe('3600')
        ->and($q['response-content-disposition'])->toContain('filename="acme-ltd-2026-03-09.zip"');
    $row = DB::table('projects')->where('id', $project->id)->first();
    expect($row->status)->toBe('DELIVERED')->and((int) $row->version)->toBe($version + 1);
    $audit = DB::table('audit_events')->where('project_id', $project->id)->where('type', 'state_changed')->get();
    expect($audit)->toHaveCount(1);
    expect(json_decode($audit[0]->payload, true))->toEqual(['previousStatus' => 'FINAL_FILES_READY', 'nextStatus' => 'DELIVERED', 'reason' => 'client_final_zip_download'])
        ->and($audit[0]->actor_id)->toBe($member->id);

    // Later downloads keep working, change nothing and audit nothing.
    $this->postJson("/api/projects/{$project->id}/finals")->assertOk();
    $row = DB::table('projects')->where('id', $project->id)->first();
    expect($row->status)->toBe('DELIVERED')->and((int) $row->version)->toBe($version + 1)
        ->and(DB::table('audit_events')->where('type', 'state_changed')->count())->toBe(1);
});

it('keeps serving a DELIVERED project without a transition', function () {
    [$project, $member] = fnProject('DELIVERED');
    fnSignIn($member->user);
    $this->postJson("/api/projects/{$project->id}/finals")->assertOk();
    expect(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('DELIVERED')
        ->and(DB::table('audit_events')->count())->toBe(0);
});

it('falls back through company, owner name, email local part, then logo-fountain for the brand', function () {
    [$project, $member] = fnProject('DELIVERED', ' ');
    fnSignIn($member->user);
    $member->forceFill(['first_name' => 'Ada', 'last_name' => 'Lovelace'])->save();
    $q = fnQuery($this->postJson("/api/projects/{$project->id}/finals")->json('url'));
    expect($q['response-content-disposition'])->toContain('filename="ada-lovelace-2026-03-05.zip"');
    $member->forceFill(['first_name' => null, 'last_name' => null, 'full_name' => null, 'email' => 'Jo.Bloggs@example.test'])->save();
    $q = fnQuery($this->postJson("/api/projects/{$project->id}/finals")->json('url'));
    expect($q['response-content-disposition'])->toContain('filename="jo-bloggs-2026-03-05.zip"');
});

it('guards: 401 anonymous; non-member, admin, unknown and non-uuid project are the same 404 FINAL_ZIP_NOT_AVAILABLE', function () {
    [$project] = fnProject();
    $this->postJson("/api/projects/{$project->id}/finals")->assertStatus(401);
    [, $stranger] = fnProject();
    $admin = Profile::factory()->admin()->create();
    foreach ([[$stranger, $project->id], [$admin, $project->id], [$stranger, fake()->uuid()], [$stranger, 'not-a-uuid']] as [$who, $id]) {
        fnSignIn($who->user);
        $this->postJson("/api/projects/{$id}/finals")->assertStatus(404)
            ->assertJsonPath('error.code', 'FINAL_ZIP_NOT_AVAILABLE')
            ->assertJsonPath('error.details.nextStep', 'Final files require approval and a completed delivery state.');
    }
    expect(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('FINAL_FILES_READY');
});

it('is 404 without an approved concept, without a final ZIP, or outside FINAL_FILES_READY/DELIVERED', function () {
    foreach (['approval' => fn ($p) => Concept::query()->where('project_id', $p->id)->update(['status' => 'archived']),
        'zip' => fn ($p) => FileAsset::query()->where('project_id', $p->id)->delete(),
        'status' => fn ($p) => DB::table('projects')->where('id', $p->id)->update(['status' => 'AWAITING_APPROVAL'])] as $breakIt) {
        [$project, $member] = fnProject();
        $breakIt($project);
        fnSignIn($member->user);
        $before = DB::table('projects')->where('id', $project->id)->value('status');
        $this->postJson("/api/projects/{$project->id}/finals")->assertStatus(404)->assertJsonPath('error.code', 'FINAL_ZIP_NOT_AVAILABLE');
        expect(DB::table('projects')->where('id', $project->id)->value('status'))->toBe($before);
    }
});

it('rejects a cross-origin POST before authorization or signing', function () {
    [$project, $member] = fnProject();
    fnSignIn($member->user);
    $this->withHeaders(['Origin' => 'https://evil.example'])->postJson("/api/projects/{$project->id}/finals")->assertStatus(403);
    expect(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('FINAL_FILES_READY');
});

it('answers 409 FINAL_DOWNLOAD_CONFLICT and rolls everything back when the version guard is lost mid-transaction', function () {
    [$project, $member] = fnProject();
    fnSignIn($member->user);
    $fired = false;
    DB::connection(DatabaseRoles::RUNTIME)->listen(function ($query) use (&$fired, $project) {
        if (! $fired && str_contains($query->sql, 'from "file_assets"') && str_contains($query->sql, 'order by')) {
            $fired = true;
            DB::connection(DatabaseRoles::RUNTIME)->table('projects')->where('id', $project->id)->update(['version' => DB::raw('version + 1')]);
        }
    });
    $version = (int) DB::table('projects')->where('id', $project->id)->value('version');

    $this->postJson("/api/projects/{$project->id}/finals")->assertStatus(409)
        ->assertJsonPath('error.code', 'FINAL_DOWNLOAD_CONFLICT')
        ->assertJsonPath('error.details.nextStep', 'Refresh the project before retrying.')
        ->assertJsonMissingPath('url');
    expect($fired)->toBeTrue();
    $row = DB::table('projects')->where('id', $project->id)->first();
    expect($row->status)->toBe('FINAL_FILES_READY')->and((int) $row->version)->toBe($version)
        ->and(DB::table('audit_events')->where('type', 'state_changed')->count())->toBe(0);
});
