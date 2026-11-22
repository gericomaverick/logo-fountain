<?php

// Parity test tooling (story 2.6, O-02). Never set in production: `parity:seed` refuses unless PARITY_MODE=1.

return [

    // The seed guard's first rule (as parity-seed-guard.mjs): only the string "1" arms it.
    'mode' => env('PARITY_MODE') === '1',

    // tests/parity/fixtures/scenarios, mounted read-only in the container (compose.yaml, x-php volumes).
    'scenarios_dir' => env('PARITY_SCENARIOS_DIR', '/var/www/parity-fixtures/scenarios'),

    // tests/parity/fixtures/seed-facts (the shared facts SQL and its per-app wrappers), mounted the same way.
    'seed_facts_dir' => env('PARITY_SEED_FACTS_DIR', '/var/www/parity-fixtures/seed-facts'),

];
