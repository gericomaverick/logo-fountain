<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Tests must not depend on a running Vite dev server (public/hot) or a built manifest:
        // CI starts no vite service (story 1.1b). Asset output is covered by L7, not Pest.
        $this->withoutVite();
    }
}
