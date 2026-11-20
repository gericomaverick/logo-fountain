<?php

// Story 1.1a: the app boots and serves the health check and an Inertia page.

it('answers the health check', function () {
    $this->get('/up')->assertOk();
});

it('renders the placeholder page through Inertia', function () {
    $this->get('/')
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('Home'));
});
