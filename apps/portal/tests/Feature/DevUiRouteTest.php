<?php

use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia as Assert;

// Story 1.8a: the /dev/ui component catalogue exists only in local and testing (UX §6 rule 5).

it('serves the component catalogue in testing', function () {
    $this->get('/dev/ui')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('Dev/Ui', shouldExist: false));
});

it('does not register the catalogue route in a real production process', function () {
    $env = ['APP_ENV' => 'production', 'APP_DEBUG' => 'false'];

    $production = Process::path(base_path())->env($env)->run(['php', 'artisan', 'route:list', '--json']);
    expect($production->successful())->toBeTrue($production->errorOutput());
    $uris = array_column(json_decode($production->output(), true, flags: JSON_THROW_ON_ERROR), 'uri');
    expect($uris)->toContain('/')->not->toContain('dev/ui');

    $local = Process::path(base_path())->env(['APP_ENV' => 'local'])->run(['php', 'artisan', 'route:list', '--json']);
    expect(array_column(json_decode($local->output(), true, flags: JSON_THROW_ON_ERROR), 'uri'))->toContain('dev/ui');
});
