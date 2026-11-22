<?php

namespace Database\Seeders\Parity;

/**
 * Story 2.6: one `projects[]` entry of a scenario file, with the defaults parity-seed.mjs applies
 * (`createdDaysAgo` 10, optional lists empty, a revision on an unknown concept has no concept).
 */
final readonly class ScenarioProject
{
    /**
     * @param  list<string>  $members  user keys; the first is the owner (brief author, revision requester)
     * @param  array<string, array{0: ?int, 1: int, 2: int}>  $entitlements  key => [limit, consumed, reserved]
     * @param  list<string>  $stateHistory
     * @param  ?array<mixed>  $briefAnswers
     * @param  ?array<mixed>  $briefDraftAnswers
     * @param  list<array{number: int, status: string, notes: ?string}>  $concepts
     * @param  list<array{concept: int, status: string, body: string}>  $revisionRequests
     * @param  list<array{concept: int, author: string, body: string}>  $comments
     * @param  list<array{sender: string, kind: string, body: string}>  $messages
     */
    public function __construct(
        public string $key,
        public string $clientName,
        public ?string $billingEmail,
        public array $members,
        public string $package,
        public string $status,
        public int $createdDaysAgo,
        public string $orderStatus,
        public int $orderTotalCents,
        public ?string $orderSessionId,
        public ?string $orderPaymentIntentId,
        public array $entitlements,
        public array $stateHistory,
        public ?string $holdReason,
        public ?array $briefAnswers,
        public ?array $briefDraftAnswers,
        public array $concepts,
        public array $revisionRequests,
        public array $comments,
        public array $messages,
        public bool $finalZip,
    ) {}

    /** @param list<string> $userKeys */
    public static function from(mixed $value, string $path, array $userKeys): self
    {
        $f = Fields::of($value, $path, ['key', 'client', 'package', 'status', 'createdDaysAgo', 'order', 'entitlements', 'stateHistory',
            'holdReason', 'brief', 'briefDraft', 'concepts', 'revisionRequests', 'comments', 'messages', 'finalZip']);
        $user = static function (string $key, string $at) use ($userKeys): string {
            if (! in_array($key, $userKeys, true)) {
                throw new ParitySeedError("{$at}: no user with key \"{$key}\"");
            }

            return $key;
        };

        $client = $f->object('client', ['name', 'billingEmail', 'members']);
        $members = $client->strings('members');
        if ($members === []) {
            throw new ParitySeedError($client->path('members').': needs at least one member (the owner)');
        }
        foreach ($members as $i => $member) {
            $user($member, $client->path("members[{$i}]"));
        }
        $order = $f->object('order', ['status', 'totalCents', 'sessionId', 'paymentIntentId']);

        $entitlements = [];
        foreach ($f->map('entitlements') as $key => $triple) {
            $at = $f->path('entitlements').'.'.$key;
            if (! is_array($triple) || count($triple) !== 3 || ! array_is_list($triple)
                || ! ($triple[0] === null || is_int($triple[0])) || ! is_int($triple[1]) || ! is_int($triple[2])) {
                throw new ParitySeedError("{$at}: must be [limit (integer or null), consumed, reserved]");
            }
            $entitlements[(string) $key] = [$triple[0], $triple[1], $triple[2]];
        }

        $concepts = [];
        foreach ($f->list('concepts', true) as $i => $item) {
            $c = Fields::of($item, $f->path("concepts[{$i}]"), ['number', 'status', 'notes']);
            $concepts[] = ['number' => $c->int('number'), 'status' => $c->string('status'), 'notes' => $c->nullableString('notes')];
        }
        $numbers = array_column($concepts, 'number');

        $revisions = [];
        foreach ($f->list('revisionRequests', true) as $i => $item) {
            $r = Fields::of($item, $f->path("revisionRequests[{$i}]"), ['concept', 'status', 'body']);
            $revisions[] = ['concept' => $r->int('concept'), 'status' => $r->string('status'), 'body' => $r->string('body')];
        }

        $comments = [];
        foreach ($f->list('comments', true) as $i => $item) {
            $c = Fields::of($item, $at = $f->path("comments[{$i}]"), ['concept', 'author', 'body']);
            if (! in_array($c->int('concept'), $numbers, true)) {
                throw new ParitySeedError("{$at}.concept: no concept number {$c->int('concept')} in this project");
            }
            $comments[] = ['concept' => $c->int('concept'), 'author' => $user($c->string('author'), "{$at}.author"), 'body' => $c->string('body')];
        }

        $messages = [];
        foreach ($f->list('messages', true) as $i => $item) {
            $m = Fields::of($item, $at = $f->path("messages[{$i}]"), ['sender', 'kind', 'body']);
            $messages[] = ['sender' => $user($m->string('sender'), "{$at}.sender"), 'kind' => $m->string('kind'), 'body' => $m->string('body')];
        }

        return new self(
            key: $f->string('key'),
            clientName: $client->string('name'),
            billingEmail: $client->nullableString('billingEmail'),
            members: $members,
            package: $f->string('package'),
            status: $f->string('status'),
            createdDaysAgo: $f->int('createdDaysAgo', 10),
            orderStatus: $order->string('status'),
            orderTotalCents: $order->int('totalCents'),
            orderSessionId: $order->nullableString('sessionId'),
            orderPaymentIntentId: $order->nullableString('paymentIntentId'),
            entitlements: $entitlements,
            stateHistory: $f->strings('stateHistory', true),
            holdReason: $f->nullableString('holdReason'),
            briefAnswers: $f->optionalObject('brief', ['answers'])?->map('answers'),
            briefDraftAnswers: $f->optionalObject('briefDraft', ['answers'])?->map('answers'),
            concepts: $concepts,
            revisionRequests: $revisions,
            comments: $comments,
            messages: $messages,
            finalZip: $f->bool('finalZip', false),
        );
    }
}
