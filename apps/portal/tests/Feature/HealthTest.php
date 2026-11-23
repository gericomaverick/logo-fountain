<?php

// Story 1.1a: the app boots and serves the health check and an Inertia page.

it('answers the health check', function () {
    $this->get('/up')->assertOk();
});

it('sends the root to sign-in (A-16, story 4.8)', function () {
    $this->get('/')->assertRedirect('/login');
});
