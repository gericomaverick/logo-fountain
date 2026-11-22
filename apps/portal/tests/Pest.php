<?php

use Tests\Support\RefreshDatabaseAsOwner;
use Tests\Support\TruncatesDatabaseAsOwner;
use Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature', 'Arch', 'Concurrency');

// Story 2.1 (ADR-013): never migrate on the default (runtime) connection, in tests too.
pest()->use(RefreshDatabaseAsOwner::class)->in('Feature/Schema');
pest()->use(TruncatesDatabaseAsOwner::class)->in('Concurrency');

// Story 2.2: model tests need the database. Policy and model tests that make an admin need committed rows
// (ProfileFactory::admin() sets the flag as the owner), so they use the truncation harness.
pest()->extend(TestCase::class)->use(RefreshDatabaseAsOwner::class)->in('Unit/Models');
pest()->use(TruncatesDatabaseAsOwner::class)->in('Feature/Models', 'Feature/Policies');
