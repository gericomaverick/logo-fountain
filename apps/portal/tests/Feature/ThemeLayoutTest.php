<?php

// Story 1.7: the root layout sets the theme before CSS and preloads Sfizia only where it's used.

it('runs theme-init before any stylesheet and declares both colour schemes', function () {
    $html = $this->get('/')->assertOk()->getContent();

    expect($html)
        ->toContain('<meta name="color-scheme" content="light dark">')
        ->toContain('<script src="/theme-init.js"></script>')
        ->and(strpos($html, 'theme-init.js'))->toBeLessThan(strpos($html, '<link rel="preload" as="font"'));
});

it('preloads Sfizia only on pages that render a DisplayTitle', function () {
    expect(substr_count($this->get('/')->getContent(), 'rel="preload" as="font"'))->toBe(2);

    config(['ui.display_font_pages' => []]);

    expect(substr_count($this->get('/')->getContent(), 'rel="preload" as="font"'))->toBe(1);
});
