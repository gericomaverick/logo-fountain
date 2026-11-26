<?php

use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia as Assert;

// Story 1.8a: the /dev/ui component catalogue exists only in local and testing (UX §6 rule 5).

it('serves the component catalogue in testing', function () {
    $this->get('/dev/ui')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('Dev/Ui', shouldExist: false));
});

it('serves the status components catalogue in testing, with the display font preloaded (story 1.8b)', function () {
    $response = $this->get('/dev/ui/status')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('Dev/UiStatus', shouldExist: false));

    // Its celebration banner renders the one DisplayTitle (UX §8.2), so config/ui.php preloads Sfizia.
    expect(substr_count((string) $response->getContent(), 'rel="preload" as="font"'))->toBe(2);
});

it('serves the media and data catalogue in testing (story 1.8c)', function () {
    $this->get('/dev/ui/media')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('Dev/UiMedia', shouldExist: false));
});

it('serves the app shells catalogue in testing, customer and admin, with a bounded section (story 1.9)', function () {
    $this->get('/dev/ui/shells?section=concepts')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('Dev/UiShells', shouldExist: false)->where('shell', 'customer')->where('section', 'concepts'));
    $this->get('/dev/ui/shells')
        ->assertInertia(fn (Assert $page) => $page->where('section', 'overview'));
    $this->get('/dev/ui/shells/admin?section=audit')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('Dev/UiShells', shouldExist: false)->where('shell', 'admin')->where('section', 'audit'));
    $this->get('/dev/ui/shells?section='.str_repeat('x', 100))
        ->assertInertia(fn (Assert $page) => $page->where('section', str_repeat('x', 20)));
});

it('does not register the catalogue route in a real production process', function () {
    $env = ['APP_ENV' => 'production', 'APP_DEBUG' => 'false'];

    $production = Process::path(base_path())->env($env)->run(['php', 'artisan', 'route:list', '--json']);
    expect($production->successful())->toBeTrue($production->errorOutput());
    $uris = array_column(json_decode($production->output(), true, flags: JSON_THROW_ON_ERROR), 'uri');
    expect($uris)->toContain('/')->not->toContain('dev/ui')->not->toContain('dev/ui/status')->not->toContain('dev/ui/media')->not->toContain('dev/ui/shells')->not->toContain('dev/ui/shells/admin')->not->toContain('dev/client-address')->not->toContain('dev/project-overview')->not->toContain('dev/dashboard');

    $local = Process::path(base_path())->env(['APP_ENV' => 'local'])->run(['php', 'artisan', 'route:list', '--json']);
    expect(array_column(json_decode($local->output(), true, flags: JSON_THROW_ON_ERROR), 'uri'))->toContain('dev/ui')->toContain('dev/ui/status')->toContain('dev/ui/media')->toContain('dev/ui/shells')->toContain('dev/ui/shells/admin')->toContain('dev/project-overview')->toContain('dev/dashboard');
});
