<?php

namespace Database\Seeders\Parity;

/** Story 2.6: one `users[]` entry of a scenario file (tests/parity/fixtures/scenarios/README.md). */
final readonly class ScenarioUser
{
    public function __construct(
        public string $key,
        public string $email,
        public ?string $password,
        public bool $admin,
        public string $firstName,
        public string $lastName,
        public bool $emailVerified,
    ) {}

    public static function from(mixed $value, string $path): self
    {
        $f = Fields::of($value, $path, ['key', 'email', 'password', 'admin', 'firstName', 'lastName', 'emailVerified']);

        return new self(
            $f->string('key'), $f->string('email'), $f->nullableString('password'), $f->bool('admin'),
            $f->string('firstName'), $f->string('lastName'), $f->bool('emailVerified'),
        );
    }
}
