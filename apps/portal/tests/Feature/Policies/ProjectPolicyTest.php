<?php

use App\Models\ClientMembership;
use App\Models\Profile;
use App\Models\Project;
use App\Models\User;
use App\Support\ErrorCodes;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/*
 * Story 2.2 AC 2 (C-20, D-20): participate = membership only; view = admin, else member; administer = admin.
 * Admin = profiles.is_admin and a verified email (isAdminUser, lib/auth/admin.ts:4).
 */

function memberOf(Project $project): User
{
    return ClientMembership::factory()->create(['client_id' => $project->client_id])->profile->user;
}

function inspectProject(User $user, string $ability, Project|string $project): Response
{
    return Gate::forUser($user)->inspect($ability, $project);
}

function expectProjectNotFound(Response $response): void
{
    expect($response->allowed())->toBeFalse()
        ->and($response->status())->toBe(404)
        ->and($response->code())->toBe(ErrorCodes::PROJECT_NOT_FOUND)
        ->and($response->message())->toBe('Project not found');
}

function expectForbidden(Response $response): void
{
    expect($response->allowed())->toBeFalse()
        ->and($response->status())->toBe(403)
        ->and($response->code())->toBe(ErrorCodes::FORBIDDEN)
        ->and($response->message())->toBe('Forbidden');
}

it('lets a member participate and view', function () {
    $project = Project::factory()->create();
    $member = memberOf($project);

    expect(inspectProject($member, 'participate', $project)->allowed())->toBeTrue()
        ->and(inspectProject($member, 'view', $project)->allowed())->toBeTrue();
    expectForbidden(inspectProject($member, 'administer', Project::class));
});

it('answers a non-member, or a member of another client, with 404 PROJECT_NOT_FOUND', function () {
    $project = Project::factory()->create();
    $outsider = Profile::factory()->create()->user;
    $otherTenant = memberOf(Project::factory()->create());

    foreach ([$outsider, $otherTenant] as $user) {
        expectProjectNotFound(inspectProject($user, 'participate', $project));
        expectProjectNotFound(inspectProject($user, 'view', $project));
        expectForbidden(inspectProject($user, 'administer', Project::class));
    }
});

it('lets a verified admin view and administer, but not participate without membership', function () {
    $project = Project::factory()->create();
    $admin = Profile::factory()->admin()->create()->user;

    expect($admin->isAdmin())->toBeTrue()
        ->and(inspectProject($admin, 'view', $project)->allowed())->toBeTrue()
        ->and(inspectProject($admin, 'administer', Project::class)->allowed())->toBeTrue();
    expectProjectNotFound(inspectProject($admin, 'participate', $project));
});

it('lets an admin who is also a member participate', function () {
    $project = Project::factory()->create();
    $admin = Profile::factory()->admin()->create();
    ClientMembership::factory()->create(['client_id' => $project->client_id, 'user_id' => $admin->id]);

    expect(inspectProject($admin->user, 'participate', $project)->allowed())->toBeTrue();
});

it('does not query membership when an admin views', function () {
    $admin = Profile::factory()->admin()->create()->user;
    $admin->load('profile');
    $unknown = new Project(['client_id' => (string) str()->uuid()]);

    DB::enableQueryLog();
    $response = inspectProject($admin, 'view', $unknown);
    $queries = collect(DB::getQueryLog())->pluck('query')->implode("\n");

    expect($response->allowed())->toBeTrue()
        ->and($queries)->not->toContain('client_memberships');
});

it('treats an admin flag with an unverified email as an ordinary user on all three abilities', function () {
    $project = Project::factory()->create();
    $unverified = Profile::factory()->unverified()->admin()->create();

    expect($unverified->is_admin)->toBeTrue()
        ->and($unverified->user->isAdmin())->toBeFalse();
    expectProjectNotFound(inspectProject($unverified->user, 'view', $project));
    expectProjectNotFound(inspectProject($unverified->user, 'participate', $project));
    expectForbidden(inspectProject($unverified->user, 'administer', Project::class));

    ClientMembership::factory()->create(['client_id' => $project->client_id, 'user_id' => $unverified->id]);
    expect(inspectProject($unverified->user, 'view', $project)->allowed())->toBeTrue()
        ->and(inspectProject($unverified->user, 'participate', $project)->allowed())->toBeTrue();
});
