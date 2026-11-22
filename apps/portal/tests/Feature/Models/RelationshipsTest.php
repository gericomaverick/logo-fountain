<?php

use App\Models\AuditEvent;
use App\Models\AuthProof;
use App\Models\Client;
use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\ConceptComment;
use App\Models\FileAsset;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\Profile;
use App\Models\Project;
use App\Models\ProjectBrief;
use App\Models\ProjectBriefDraft;
use App\Models\ProjectEntitlement;
use App\Models\ProjectOrder;
use App\Models\ProjectReadState;
use App\Models\RevisionRequest;

/* Story 2.2 AC 1: relationships, both ways, on committed rows. */

it('links every model both ways', function () {
    $profile = Profile::factory()->create();
    $client = Client::factory()->create();
    $membership = ClientMembership::factory()->for($client)->for($profile)->create();
    $project = Project::factory()->for($client)->create();
    $concept = Concept::factory()->for($project)->create();
    $asset = FileAsset::factory()->forConcept($concept)->create(['uploaded_by' => $profile->id]);
    $thread = MessageThread::query()->create(['project_id' => $project->id]);
    $message = Message::query()->create(['thread_id' => $thread->id, 'project_id' => $project->id, 'sender_id' => $profile->id, 'body' => 'b']);
    $comment = ConceptComment::query()->create(['project_id' => $project->id, 'concept_id' => $concept->id, 'author_id' => $profile->id, 'body' => 'c']);
    $revision = RevisionRequest::query()->create(['project_id' => $project->id, 'concept_id' => $concept->id, 'status' => 'open', 'requested_by' => $profile->id, 'body' => 'r']);
    $brief = ProjectBrief::query()->create(['project_id' => $project->id, 'version' => 1, 'answers' => new stdClass, 'created_by' => $profile->id]);
    $draft = ProjectBriefDraft::query()->create(['project_id' => $project->id, 'answers' => new stdClass, 'updated_by' => $profile->id]);
    $order = ProjectOrder::query()->create(['project_id' => $project->id, 'client_id' => $client->id, 'status' => 'pending', 'currency' => 'gbp', 'total_cents' => 100]);
    $entitlement = ProjectEntitlement::query()->create(['project_id' => $project->id, 'key' => 'revisions', 'limit_int' => 2]);
    $audit = AuditEvent::query()->create(['project_id' => $project->id, 'actor_id' => $profile->id, 'type' => 't', 'payload' => new stdClass]);
    $read = ProjectReadState::query()->create(['user_id' => $profile->id, 'project_id' => $project->id]);
    $proof = AuthProof::query()->create(['token_hash' => str_repeat('a', 64), 'user_id' => $profile->id, 'kind' => 'magic', 'credential_version' => 0, 'expires_at' => now()->addHour()]);

    expect($profile->user->profile?->id)->toBe($profile->id)
        ->and($membership->client->id)->toBe($client->id)
        ->and($membership->profile->id)->toBe($profile->id)
        ->and($client->memberships->pluck('id')->all())->toBe([$membership->id])
        ->and($profile->memberships->pluck('id')->all())->toBe([$membership->id])
        ->and($client->projects->pluck('id')->all())->toBe([$project->id])
        ->and($project->client->id)->toBe($client->id)
        ->and($project->concepts->pluck('id')->all())->toBe([$concept->id])
        ->and($concept->project->id)->toBe($project->id)
        ->and($project->fileAssets->pluck('id')->all())->toBe([$asset->id])
        ->and($asset->project->id)->toBe($project->id)
        ->and($asset->uploader->id)->toBe($profile->id)
        ->and($project->messageThread?->id)->toBe($thread->id)
        ->and($thread->project->id)->toBe($project->id)
        ->and($thread->messages->pluck('id')->all())->toBe([$message->id])
        ->and($message->thread->id)->toBe($thread->id)
        ->and($message->sender->id)->toBe($profile->id)
        ->and($project->messages->pluck('id')->all())->toBe([$message->id])
        ->and($concept->comments->pluck('id')->all())->toBe([$comment->id])
        ->and($comment->concept->id)->toBe($concept->id)
        ->and($comment->author->id)->toBe($profile->id)
        ->and($project->conceptComments->pluck('id')->all())->toBe([$comment->id])
        ->and($concept->revisionRequests->pluck('id')->all())->toBe([$revision->id])
        ->and($revision->concept?->id)->toBe($concept->id)
        ->and($revision->requester->id)->toBe($profile->id)
        ->and($project->revisionRequests->pluck('id')->all())->toBe([$revision->id])
        ->and($project->briefs->pluck('id')->all())->toBe([$brief->id])
        ->and($brief->author->id)->toBe($profile->id)
        ->and($project->briefDraft?->project_id)->toBe($draft->project_id)
        ->and($draft->editor->id)->toBe($profile->id)
        ->and($project->orders->pluck('id')->all())->toBe([$order->id])
        ->and($client->orders->pluck('id')->all())->toBe([$order->id])
        ->and($order->project->id)->toBe($project->id)
        ->and($project->entitlements->pluck('id')->all())->toBe([$entitlement->id])
        ->and($entitlement->project->id)->toBe($project->id)
        ->and($project->auditEvents->pluck('id')->all())->toBe([$audit->id])
        ->and($audit->actor?->id)->toBe($profile->id)
        ->and($project->readStates->pluck('id')->all())->toBe([$read->id])
        ->and($profile->readStates->pluck('id')->all())->toBe([$read->id])
        ->and($read->profile->id)->toBe($profile->id)
        ->and($proof->user->id)->toBe($profile->id)
        ->and($profile->user->authProofs->pluck('token_hash')->all())->toBe([$proof->token_hash]);
});

it('never writes is_admin from a model save, so saving an admin profile passes the trigger', function () {
    $admin = Profile::factory()->admin()->create();

    $admin->update(['full_name' => 'Renamed Admin', 'is_admin' => false]);

    expect($admin->fresh()?->is_admin)->toBeTrue()
        ->and($admin->fresh()?->full_name)->toBe('Renamed Admin')
        ->and($admin->user->isAdmin())->toBeTrue();
});
