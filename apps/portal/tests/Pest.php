<?php

use Tests\Support\RefreshDatabaseAsOwner;
use Tests\Support\TruncatesDatabaseAsOwner;
use Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature', 'Arch', 'Concurrency');

// Story 2.1 (ADR-013): never migrate on the default (runtime) connection, in tests too.
pest()->use(RefreshDatabaseAsOwner::class)->in('Feature/Schema');
pest()->use(TruncatesDatabaseAsOwner::class)->in('Concurrency');
