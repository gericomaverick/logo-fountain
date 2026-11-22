<?php

use Database\Seeders\Parity\ScenarioId;

// Story 2.6 AC 5 (O-02): golden values printed by Node's scenarioId (apps/web/scripts/parity-seed.mjs:46-49,
// the same function as tests/parity/adapters/seed.ts:33-37), so both seeders give a row the same id.
it('matches the Node scenarioId for :dataset', function (string $scenario, string $kind, string $key, string $uuid) {
    expect(ScenarioId::for($scenario, $kind, $key))->toBe($uuid);
})->with([
    'a user' => ['two-tenants', 'user', 'admin', 'c17fb24c-be21-4a28-b275-eabfcbb4a2d4'],
    'a project' => ['two-tenants', 'project', 'pA', '1c087896-bdd2-4831-8034-757310d2dc03'],
    'a client' => ['fresh-purchase', 'client', 'p1', '10cc0904-adcf-40b2-beb2-6dd33a05fd25'],
    'a membership' => ['admin-queue', 'membership', 'q1:clientA', '60f53184-ce4b-47ce-90c4-4a25fad9899b'],
    'a state_changed audit' => ['on-hold', 'audit', 'p1:state:ON_HOLD:4', 'd0d2a4b8-914e-4854-b2f4-fc941d9745be'],
    'a final ZIP asset' => ['delivered', 'asset', 'p1:final', '9f6b928f-9bb9-476e-98fd-3cb141568d1d'],
    'a concept' => ['concepts-ready', 'concept', 'p1:2', '3d59924b-8c7c-4889-959a-2ad48e5172a7'],
    'arbitrary strings' => ['a', 'b', 'c', 'b0ee04f8-80c4-4f42-a147-9e2e7822b741'],
]);

it('is shaped as a version 4, RFC 4122 variant UUID', function () {
    foreach (range(1, 50) as $i) {
        expect(ScenarioId::for('shape', 'row', (string) $i))->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/');
    }
});
