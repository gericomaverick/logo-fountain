<?php

use App\Models\Concept;
use App\Models\FileAsset;
use PHPUnit\Framework\ExpectationFailedException;
use Tests\Fixtures\Arch\LeakyClientController;

/*
 * Story 2.2 (ADR-020, DV-7): client controllers never touch Concept or FileAsset directly; they reach concepts
 * and concept files only through Project::clientVisibleConcepts() / clientVisibleAssets() (or a visible
 * concept's assets()). Two checks: the model classes are not referenced, and the unscoped relations
 * (->concepts(), ->fileAssets(), ->conceptComments(), ->revisionRequests(), ->concept, ->asset) are not called. Admin controllers (the Admin sub-namespaces) read every status and are ignored.
 * Actions are shared by client and admin paths, so they're covered by ConceptPolicyTest and the DV-7
 * @deviation tests instead.
 */

/** The rule, verified when the returned expectation is released (end of the call). */
function expectClientConceptScope(string $namespace): void
{
    expect($namespace)->not->toUse([Concept::class, FileAsset::class])->ignoring($namespace.'\\Admin');
}

/**
 * ADR-020 second half: the unscoped relations (every status, admin paths only) and the child-to-concept
 * relations are never called from client code. Code only (comments may name them).
 *
 * @return list<string> "file: ->relation" for every offending call
 */
function unscopedConceptReaches(string $dir): array
{
    $hits = [];
    $files = is_dir($dir) ? new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) : [];
    foreach ($files as $file) {
        if ($file->getExtension() !== 'php' || str_contains($file->getPathname(), DIRECTORY_SEPARATOR.'Admin'.DIRECTORY_SEPARATOR)) {
            continue;
        }
        $code = '';
        foreach (token_get_all(file_get_contents($file->getPathname())) as $token) {
            if (! is_array($token) || ! in_array($token[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                $code .= is_array($token) ? $token[1] : $token;
            }
        }
        if (preg_match_all('/\?*->\s*(concepts|fileAssets|conceptComments|revisionRequests|concept|asset)\b/', $code, $m)) {
            foreach ($m[1] as $relation) {
                $hits[] = basename($file->getPathname()).': ->'.$relation;
            }
        }
    }

    return $hits;
}

it('keeps client controllers off the unscoped relations', function () {
    expect(unscopedConceptReaches(app_path('Http/Controllers/Api')))->toBe([])
        ->and(unscopedConceptReaches(app_path('Http/Controllers/Pages')))->toBe([]);
});

it('catches unscoped relation reaches in a client controller, and passes scoped code', function () {
    expect(unscopedConceptReaches(__DIR__.'/../Fixtures/Arch'))->toBe([
        'LeakyClientController.php: ->concepts',
        'LeakyClientController.php: ->fileAssets',
    ]);
});

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
