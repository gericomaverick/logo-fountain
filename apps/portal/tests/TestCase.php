<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Tests must not depend on a running Vite dev server (public/hot) or a built manifest: CI starts
        // no vite service (1.1b). The real assets are covered by bin/browser-test (L7, 1.7).
        $this->withoutVite();
    }
}
