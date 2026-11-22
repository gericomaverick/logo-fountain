<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Support\MigratesAsOwner;

abstract class TestCase extends BaseTestCase
{
    use MigratesAsOwner;

    protected function setUp(): void
    {
        parent::setUp();

        // Tests must not depend on a running Vite dev server (public/hot) or a built manifest: CI starts
        // no vite service (1.1b). The real assets are covered by bin/browser-test (L7, 1.7).
        $this->withoutVite();
    }

    /** @return array<class-string, class-string> */
    protected function setUpTraits()
    {
        // Story 2.1 AC 8: owner migration + grants before any test, whatever harness the test uses.
        $this->migrateAsOwnerOnce();

        return parent::setUpTraits();
    }
}
