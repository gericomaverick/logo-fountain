<?php

namespace App\Domain;

/**
 * The outcome of `ProjectTransitions::apply()` (Next `applyTransition`'s return value). A refusal
 * carries the error and the from-state's allowed list (empty when the from-state is unknown).
 */
final readonly class ProjectTransition
{
    /** @param list<ProjectState> $allowed */
    private function __construct(
        public ?ProjectState $from,
        public ?ProjectState $to,
        public ?ProjectTransitionError $error,
        public array $allowed,
    ) {}

    public static function allowed(ProjectState $from, ProjectState $to): self
    {
        return new self($from, $to, null, $from->allowedTransitions());
    }

    /** @param list<ProjectState> $allowed */
    public static function refused(ProjectTransitionError $error, array $allowed): self
    {
        return new self(null, null, $error, $allowed);
    }

    public function ok(): bool
    {
        return $this->error === null;
    }

    /**
     * Next's JSON shape, keys in Next's order: `{ok, from, to, label, primaryCta}` on success,
     * `{ok, allowed, error}` on refusal.
     *
     * @return array{ok: true, from: string, to: string, label: string, primaryCta: string}|array{ok: false, allowed: list<string>, error: string}
     */
    public function toArray(): array
    {
        if ($this->error !== null || $this->from === null || $this->to === null) {
            return [
                'ok' => false,
                'allowed' => array_map(fn (ProjectState $s): string => $s->value, $this->allowed),
                'error' => ($this->error ?? ProjectTransitionError::InvalidState)->value,
            ];
        }

        return [
            'ok' => true,
            'from' => $this->from->value,
            'to' => $this->to->value,
            'label' => $this->to->label(),
            'primaryCta' => $this->to->primaryCta(),
        ];
    }
}
