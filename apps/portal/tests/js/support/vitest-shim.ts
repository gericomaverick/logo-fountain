// Story 1.8c: the subset of Vitest's API that ported apps/web suites use, on node:test + node:assert,
// so a suite moves over with its bodies unchanged (project-context: "with their Vitest suites")
// without adding Vitest to the portal. Extend it only when a ported suite needs another matcher.
import assert from 'node:assert/strict';

export { describe, test as it } from 'node:test';

type Matchers = {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    not: { toBe(expected: unknown): void; toEqual(expected: unknown): void; toContain(expected: unknown): void };
};

function contains(actual: unknown, expected: unknown): boolean {
    if (typeof actual === 'string') return actual.includes(String(expected));
    if (Array.isArray(actual)) return actual.includes(expected);
    throw new TypeError('toContain needs a string or an array');
}

export function expect(actual: unknown): Matchers {
    return {
        toBe: (expected) => assert.ok(Object.is(actual, expected), `expected ${String(actual)} to be ${String(expected)}`),
        toEqual: (expected) => assert.deepStrictEqual(actual, expected),
        toContain: (expected) => assert.ok(contains(actual, expected), `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`),
        toHaveLength: (expected) => assert.equal((actual as { length: number }).length, expected),
        not: {
            toBe: (expected) => assert.ok(!Object.is(actual, expected), `expected ${String(actual)} not to be ${String(expected)}`),
            toEqual: (expected) => assert.notDeepStrictEqual(actual, expected),
            toContain: (expected) => assert.ok(!contains(actual, expected), `expected ${JSON.stringify(actual)} not to contain ${JSON.stringify(expected)}`),
        },
    };
}
