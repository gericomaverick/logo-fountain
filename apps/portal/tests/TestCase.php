<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Pest renders pages without a running Vite dev server or a build (public/hot or
        // public/build). Browser checks cover the real assets (bin/browser-test).
        $this->withoutVite();
    }
}
