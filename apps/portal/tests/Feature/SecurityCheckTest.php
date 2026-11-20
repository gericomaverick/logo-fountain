<?php

use Illuminate\Support\Facades\File;

// O-04 (story 1.1b): port of apps/web/scripts/security-check.mjs. Each case plants one leak in a scratch project.

beforeEach(function () {
    $this->root = sys_get_temp_dir().'/security-check-'.bin2hex(random_bytes(6));
    File::ensureDirectoryExists($this->root.'/resources/js/Pages');
    File::put($this->root.'/.env.example', "APP_KEY=\nDB_PASSWORD=dev-only-runtime\nVITE_APP_NAME=\"\${APP_NAME}\"\n");
    File::put($this->root.'/resources/js/app.tsx', "const name = import.meta.env.VITE_APP_NAME;\n");
    File::put($this->root.'/vite.config.ts', "export default defineConfig({ plugins: [] });\n");
});

afterEach(fn () => File::deleteDirectory($this->root));

it('passes on the real app', function () {
    $this->artisan('security:check')->assertSuccessful();
});

it('passes on a clean project', function () {
    $this->artisan('security:check', ['--path' => $this->root])
        ->expectsOutputToContain('Security check passed')
        ->assertSuccessful();
});

it('rejects a secret-looking public env name', function () {
    File::append($this->root.'/.env.example', "VITE_STRIPE_SECRET_KEY=x\n");

    $this->artisan('security:check', ['--path' => $this->root])
        ->expectsOutputToContain('.env.example: forbidden public env var name (VITE_STRIPE_SECRET_KEY)')
        ->assertFailed();
});

it('rejects a public value that copies a private one', function () {
    File::put($this->root.'/.env', "DB_PASSWORD=hunter2-long\nVITE_DB=hunter2-long\n");

    $this->artisan('security:check', ['--path' => $this->root])
        ->expectsOutputToContain('.env: public VITE_DB duplicates private DB_PASSWORD')
        ->assertFailed();
});

it('rejects a public value that interpolates a private one', function () {
    File::append($this->root.'/.env.example', "VITE_KEY=\"\${APP_KEY}\"\n");

    $this->artisan('security:check', ['--path' => $this->root])
        ->expectsOutputToContain('public VITE_KEY references private APP_KEY')
        ->assertFailed();
});

it('rejects frontend code reading a private credential', function (string $read) {
    File::put($this->root.'/resources/js/Pages/Leak.tsx', "const k = {$read};\n");

    $this->artisan('security:check', ['--path' => $this->root])
        ->expectsOutputToContain('resources/js/Pages/Leak.tsx: private credential read through import.meta.env')
        ->assertFailed();
})->with([
    'private name' => 'import.meta.env.STRIPE_SECRET',
    'prefixed private name' => 'import.meta.env.VITE_AWS_SECRET_ACCESS_KEY',
    'secret-looking name' => "import.meta.env['VITE_ADMIN_TOKEN']",
]);

it('rejects a widened vite envPrefix', function () {
    File::put($this->root.'/vite.config.ts', "export default defineConfig({ envPrefix: ['VITE_', 'APP_'] });\n");

    $this->artisan('security:check', ['--path' => $this->root])
        ->expectsOutputToContain("vite.config.ts: envPrefix must stay 'VITE_'")
        ->assertFailed();
});

it('allows an explicit VITE_ envPrefix', function () {
    File::put($this->root.'/vite.config.ts', "export default defineConfig({ envPrefix: 'VITE_' });\n");

    $this->artisan('security:check', ['--path' => $this->root])->assertSuccessful();
});
