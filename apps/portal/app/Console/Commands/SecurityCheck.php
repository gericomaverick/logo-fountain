<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Symfony\Component\Finder\Finder;

/**
 * Port of apps/web/scripts/security-check.mjs (O-04, story 1.1b): no private credential may reach the browser.
 *
 * Next exposed NEXT_PUBLIC_* variables to the client bundle; here Vite exposes VITE_* (its `envPrefix`).
 * Checks:
 *  1. env files: no VITE_* name that looks like a secret, and no VITE_* value that copies or references a private one;
 *  2. frontend source (resources/js): no import.meta.env read of a private credential;
 *  3. vite config: `envPrefix` is not widened beyond VITE_ (that would publish every matching variable).
 *
 * Next's "client file imports server auth code" check has no counterpart: Inertia pages can't import PHP.
 */
class SecurityCheck extends Command
{
    protected $signature = 'security:check {--path= : Project root to scan (defaults to the app base path)}';

    protected $description = 'Fail if a private credential can reach the browser bundle (VITE_* env, frontend source, vite envPrefix)';

    /** Private settings whose value must never be public. Add new secrets here when their story adds them. */
    public const PRIVATE_KEYS = [
        'APP_KEY',
        'DB_PASSWORD',
        'DB_MIGRATE_PASSWORD',
        'AWS_SECRET_ACCESS_KEY',
        'MAIL_PASSWORD',
        'POSTMARK_TOKEN',
        'POSTMARK_API_KEY',
        'STRIPE_SECRET',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
    ];

    /** A public (VITE_*) name containing one of these is treated as a secret. */
    private const SECRET_NAME = '/SECRET|PASSWORD|PRIVATE|SERVICE_ROLE|TOKEN/i';

    private const ENV_FILES = ['.env', '.env.example', '.env.testing', '.env.production'];

    public function handle(): int
    {
        $option = $this->option('path');
        $root = rtrim(is_string($option) && $option !== '' ? $option : base_path(), '/');

        $issues = [...$this->checkEnvFiles($root), ...$this->checkFrontend($root), ...$this->checkViteConfig($root)];

        if ($issues !== []) {
            $this->error('Security check failed:');
            foreach ($issues as $issue) {
                $this->line("- {$issue}");
            }

            return self::FAILURE;
        }

        $this->info('Security check passed: no private credential can reach the browser bundle.');

        return self::SUCCESS;
    }

    /** @return list<string> */
    private function checkEnvFiles(string $root): array
    {
        $issues = [];
        foreach (self::ENV_FILES as $rel) {
            $file = "{$root}/{$rel}";
            if (! is_file($file)) {
                continue;
            }
            $env = $this->parseEnv((string) file_get_contents($file));
            foreach ($env as $key => $value) {
                if (! str_starts_with($key, 'VITE_')) {
                    continue;
                }
                if (preg_match(self::SECRET_NAME, $key) === 1) {
                    $issues[] = "{$rel}: forbidden public env var name ({$key})";
                }
                foreach (self::PRIVATE_KEYS as $private) {
                    $secret = $env[$private] ?? '';
                    if (str_contains($value, '${'.$private.'}')) {
                        $issues[] = "{$rel}: public {$key} references private {$private}";
                    } elseif ($secret !== '' && $secret !== 'null' && $value === $secret) {
                        $issues[] = "{$rel}: public {$key} duplicates private {$private}";
                    }
                }
            }
        }

        return $issues;
    }

    /** @return list<string> */
    private function checkFrontend(string $root): array
    {
        if (! is_dir("{$root}/resources/js")) {
            return [];
        }
        $private = implode('|', self::PRIVATE_KEYS);
        $pattern = '/import\.meta\.env(?:\.|\[\s*[\'"`])(?:VITE_)?(?:'.$private.')\b|import\.meta\.env(?:\.|\[\s*[\'"`])VITE_\w*(?:SECRET|PASSWORD|PRIVATE|SERVICE_ROLE|TOKEN)/i';

        $issues = [];
        $files = Finder::create()->files()->in("{$root}/resources/js")->name('/\.(ts|tsx|js|jsx|mjs|cjs|vue)$/');
        foreach ($files as $file) {
            if (preg_match($pattern, $file->getContents()) === 1) {
                $issues[] = "resources/js/{$file->getRelativePathname()}: private credential read through import.meta.env";
            }
        }

        return $issues;
    }

    /** @return list<string> */
    private function checkViteConfig(string $root): array
    {
        $issues = [];
        foreach (glob("{$root}/vite.config.{ts,js,mjs,mts,cjs}", GLOB_BRACE) ?: [] as $file) {
            $source = (string) file_get_contents($file);
            if (preg_match('/envPrefix\s*:\s*([^,\n}]+)/', $source, $m) === 1 && preg_match('/^[\'"`]VITE_[\'"`]$/', trim($m[1])) !== 1) {
                $issues[] = basename($file).': envPrefix must stay \'VITE_\' (found '.trim($m[1]).')';
            }
        }

        return $issues;
    }

    /** @return array<string, string> */
    private function parseEnv(string $content): array
    {
        $values = [];
        foreach (preg_split('/\r?\n/', $content) ?: [] as $raw) {
            $line = trim($raw);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $eq = strpos($line, '=');
            if ($eq === false || $eq === 0) {
                continue;
            }
            $key = trim(substr($line, 0, $eq));
            if (str_starts_with($key, 'export ')) {
                $key = trim(substr($key, 7));
            }
            $values[$key] = trim(trim(substr($line, $eq + 1)), '"\'');
        }

        return $values;
    }
}
