<?php

namespace Database\Seeders\Parity;

/**
 * Story 2.6: typed, strict reads of one JSON object in a scenario file. An unknown key is an error, so a fixture
 * that grows a field the seeder doesn't handle fails loudly instead of seeding half of it.
 */
final class Fields
{
    /**
     * @param  array<mixed>  $data
     * @param  list<string>  $allowed
     */
    public function __construct(private readonly array $data, private readonly string $path, array $allowed)
    {
        foreach (array_keys($data) as $key) {
            if (! in_array($key, $allowed, true)) {
                throw new ParitySeedError("{$this->path}: unknown key \"{$key}\" (the parity seeder doesn't handle it)");
            }
        }
    }

    /** @param list<string> $allowed */
    public static function of(mixed $value, string $path, array $allowed): self
    {
        if (! is_array($value) || ($value !== [] && array_is_list($value))) {
            throw new ParitySeedError("{$path}: must be an object");
        }

        return new self($value, $path, $allowed);
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->data);
    }

    public function string(string $key): string
    {
        $value = $this->data[$key] ?? null;
        if (! is_string($value)) {
            throw new ParitySeedError("{$this->path}.{$key}: must be a string");
        }

        return $value;
    }

    public function nullableString(string $key): ?string
    {
        return ($this->data[$key] ?? null) === null ? null : $this->string($key);
    }

    public function bool(string $key, ?bool $default = null): bool
    {
        $value = $this->data[$key] ?? $default;
        if (! is_bool($value)) {
            throw new ParitySeedError("{$this->path}.{$key}: must be true or false");
        }

        return $value;
    }

    public function int(string $key, ?int $default = null): int
    {
        $value = $this->data[$key] ?? $default;
        if (! is_int($value)) {
            throw new ParitySeedError("{$this->path}.{$key}: must be an integer");
        }

        return $value;
    }

    /** @param list<string> $allowed */
    public function object(string $key, array $allowed): self
    {
        return self::of($this->data[$key] ?? null, "{$this->path}.{$key}", $allowed);
    }

    /** @param list<string> $allowed */
    public function optionalObject(string $key, array $allowed): ?self
    {
        return ($this->data[$key] ?? null) === null ? null : $this->object($key, $allowed);
    }

    /**
     * A JSON object whose keys are data (brief answers), kept as decoded.
     *
     * @return array<mixed>
     */
    public function map(string $key): array
    {
        $value = $this->data[$key] ?? null;
        if (! is_array($value) || ($value !== [] && array_is_list($value))) {
            throw new ParitySeedError("{$this->path}.{$key}: must be an object");
        }

        return $value;
    }

    /** @return list<mixed> */
    public function list(string $key, bool $optional = false): array
    {
        $value = $this->data[$key] ?? null;
        if ($value === null && $optional) {
            return [];
        }
        if (! is_array($value) || ! array_is_list($value)) {
            throw new ParitySeedError("{$this->path}.{$key}: must be an array");
        }

        return $value;
    }

    /** @return list<string> */
    public function strings(string $key, bool $optional = false): array
    {
        $items = [];
        foreach ($this->list($key, $optional) as $i => $item) {
            if (! is_string($item)) {
                throw new ParitySeedError("{$this->path}.{$key}[{$i}]: must be a string");
            }
            $items[] = $item;
        }

        return $items;
    }

    public function path(string $key): string
    {
        return "{$this->path}.{$key}";
    }
}
