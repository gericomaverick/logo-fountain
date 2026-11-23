<?php

use Inertia\Testing\AssertableInertia as Assert;

// Story 4.9b (A-05..A-08): the auth screens render; tokens never reach the server (they live in the fragment).

it('renders each auth screen', function (string $path, string $component) {
    $this->get($path)->assertOk()->assertInertia(fn (Assert $page) => $page->component($component, shouldExist: false));
})->with([
    ['/login', 'Auth/Login'],
    ['/forgot-password', 'Auth/ForgotPassword'],
    ['/set-password', 'Auth/SetPassword'],
    ['/reset-password', 'Auth/ResetPassword'],
    ['/auth/callback', 'Auth/Callback'],
]);

it('passes login a SafeNext path only', function (string $given, string $expected) {
    $this->get('/login?next='.urlencode($given))
        ->assertInertia(fn (Assert $page) => $page->component('Auth/Login', shouldExist: false)->where('next', $expected));
})->with([
    ['/dashboard/x', '/dashboard/x'],
    ['//evil.example', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['/%2fevil.example', '/dashboard'],
]);

it('shows the password-updated note only for password=updated', function () {
    $this->get('/login?password=updated')->assertInertia(fn (Assert $p) => $p->where('passwordUpdated', true));
    $this->get('/login')->assertInertia(fn (Assert $p) => $p->where('passwordUpdated', false));
});
