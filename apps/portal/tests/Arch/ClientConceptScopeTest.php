<?php

use App\Models\Concept;
use App\Models\FileAsset;
use PHPUnit\Framework\ExpectationFailedException;
use Tests\Fixtures\Arch\LeakyClientController;

/*
 * Story 2.2 (ADR-020, DV-7): client controllers never touch Concept or FileAsset directly; they reach concepts
 * and concept files only through Project::clientVisibleConcepts() / clientVisibleAssets() (or a visible
 * concept's assets()). Admin controllers (the Admin sub-namespaces) read every status and are ignored.
 * Actions are shared by client and admin paths, so they're covered by ConceptPolicyTest and the DV-7
 * @deviation tests instead.
 */

/** The rule, verified when the returned expectation is released (end of the call). */
function expectClientConceptScope(string $namespace): void
{
    expect($namespace)->not->toUse([Concept::class, FileAsset::class])->ignoring($namespace.'\\Admin');
}

it('keeps client API controllers off Concept and FileAsset', function () {
    expectClientConceptScope('App\\Http\\Controllers\\Api');
});

it('keeps client page controllers off Concept and FileAsset', function () {
    expectClientConceptScope('App\\Http\\Controllers\\Pages');
});

it('fails on a client controller that looks a concept up by id (the rule is not vacuous)', function () {
    expect(fn () => expectClientConceptScope(LeakyClientController::class))
        ->toThrow(ExpectationFailedException::class, "not to use 'App\\Models\\Concept'");
});

it('passes on scoped client code and ignores the Admin sub-namespace', function () {
    expectClientConceptScope('Tests\\Fixtures\\Arch\\Scoped');

    // The fixture's Admin controller does use FileAsset: only the ignore lets the rule pass.
    expect(fn () => expect('Tests\\Fixtures\\Arch\\Scoped')->not->toUse(FileAsset::class))
        ->toThrow(ExpectationFailedException::class);
});
