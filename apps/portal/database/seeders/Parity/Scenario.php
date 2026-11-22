<?php

namespace Database\Seeders\Parity;

use JsonException;

/**
 * Story 2.6 (O-02): one scenario of tests/parity/fixtures/scenarios, read in place through the read-only mount
 * (apps/portal/compose.yaml, x-php volumes). Validated in full before anything is written.
 */
final readonly class Scenario
{
    /**
     * @param  list<ScenarioUser>  $users
     * @param  list<ScenarioProject>  $projects
     */
    private function __construct(public string $name, public array $users, public array $projects) {}

    /** The name rule of parity-seed.mjs:57. */
    public static function validName(string $name): bool
    {
        return preg_match('/^[a-z0-9-]+$/', $name) === 1;
    }

    public static function load(string $dir, string $name): self
    {
        if (! self::validName($name)) {
            throw new ParitySeedError("Usage: php artisan parity:seed <scenario> (\"{$name}\" is not a scenario name: a-z, 0-9 and -)");
        }
        if (! is_dir($dir)) {
            throw new ParitySeedError("scenario directory {$dir} is missing: mount tests/parity/fixtures/scenarios there (apps/portal/compose.yaml, x-php volumes)");
        }
        $file = rtrim($dir, '/')."/{$name}.json";
        if (! is_file($file)) {
            throw new ParitySeedError("unknown scenario \"{$name}\" (no {$file})");
        }
        try {
            $json = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new ParitySeedError("{$name}.json: malformed JSON ({$e->getMessage()})");
        }

        return self::fromArray($name, $json);
    }

    public static function fromArray(string $name, mixed $json): self
    {
        $f = Fields::of($json, $name, ['name', 'description', 'users', 'projects']);
        $users = [];
        foreach ($f->list('users') as $i => $item) {
            $user = ScenarioUser::from($item, "{$name}.users[{$i}]");
            if (isset($users[$user->key])) {
                throw new ParitySeedError("{$name}.users[{$i}]: duplicate key \"{$user->key}\"");
            }
            $users[$user->key] = $user;
        }
        $keys = array_map('strval', array_keys($users));
        $projects = [];
        foreach ($f->list('projects') as $i => $item) {
            $projects[] = ScenarioProject::from($item, "{$name}.projects[{$i}]", $keys);
        }

        return new self($name, array_values($users), $projects);
    }

    /** The first `admin: true` user: the bootstrap admin and the actor of every state change after the first. */
    public function firstAdmin(): ?ScenarioUser
    {
        foreach ($this->users as $user) {
            if ($user->admin) {
                return $user;
            }
        }

        return null;
    }
}
