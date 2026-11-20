// Story 1.8b: the pure logic behind the status components (resources/js/lib/status.ts).
// Run: npm run test:unit. fixtures/next-timeline.json is the output of Next's own buildTimeline()
// and customerActionFor() (apps/web/src/lib/project-state-machine.ts) for every state × timestamps
// × option, generated in node:24 from the frozen apps/web (story record, "Tests").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import {
    allowanceView,
    BANNER_COPY,
    bannerCopy,
    buildTimeline,
    CELEBRATION_COPY,
    CELEBRATIONS,
    formatDate,
    isProjectState,
    MAX_SEGMENTS,
    pillLabel,
    PROJECT_STATES,
    skeletonRows,
    stepStatusText,
    trackerModel,
    turnFor,
    TURNS,
    type ProjectState,
    type TimelineItem,
} from '../../resources/js/lib/status.ts';

type Fixture = {
    cases: Array<{ state: string; timestamps: Partial<Record<ProjectState, string>>; options: { hasApprovedMilestone?: boolean } | null; timeline: TimelineItem[] }>;
    customerActionFor: Record<string, string | null>;
};
const NEXT: Fixture = JSON.parse(readFileSync(new URL('./fixtures/next-timeline.json', import.meta.url), 'utf8'));
const NEXT_STATES = Object.keys(NEXT.customerActionFor).filter((s) => s !== 'NOT_A_STATE');

describe('project states and turns (UX §2.5)', () => {
    test('the states are exactly Next’s PROJECT_STATES, in order', () => {
        assert.deepEqual([...PROJECT_STATES], NEXT_STATES);
    });

    test('every state maps to exactly one turn, as the §2.5 table says', () => {
        const expected: Record<string, string[]> = {
            'your-turn': ['AWAITING_BRIEF', 'CONCEPTS_READY', 'FINAL_FILES_READY'],
            'designers-turn': ['BRIEF_SUBMITTED', 'IN_DESIGN', 'REVISIONS_IN_PROGRESS', 'AWAITING_APPROVAL'],
            done: ['DELIVERED'],
            paused: ['ON_HOLD'],
            closed: ['CANCELLED', 'REFUNDED'],
        };
        assert.deepEqual(Object.keys(expected), [...TURNS]);
        for (const [turn, states] of Object.entries(expected)) {
            for (const s of states) assert.equal(turnFor(s), turn, s);
        }
        assert.equal(Object.values(expected).flat().length, PROJECT_STATES.length);
    });

    test('“your turn” is exactly the states where Next’s customerActionFor() asks the customer to act', () => {
        for (const s of PROJECT_STATES) assert.equal(turnFor(s) === 'your-turn', NEXT.customerActionFor[s] !== null, s);
    });

    test('an unknown state is the designer’s turn (never ask the customer to act on it)', () => {
        for (const s of ['NOT_A_STATE', '', 'APPROVED', 'awaiting_brief']) assert.equal(turnFor(s), 'designers-turn', s);
        assert.equal(isProjectState('APPROVED'), false);
        assert.equal(isProjectState(42), false);
    });

    test('pill labels: one per turn, and closed says which', () => {
        assert.equal(pillLabel('CONCEPTS_READY'), 'Your turn');
        assert.equal(pillLabel('IN_DESIGN'), 'With your designer');
        assert.equal(pillLabel('DELIVERED'), 'Complete');
        assert.equal(pillLabel('ON_HOLD'), 'Paused');
        assert.equal(pillLabel('CANCELLED'), 'Cancelled');
        assert.equal(pillLabel('REFUNDED'), 'Refunded');
        assert.equal(pillLabel('???'), 'With your designer');
    });
});

describe('turn banner copy (UX §2.5, §12)', () => {
    test('every state has copy; your-turn states (and paused) have a verb-first action, the others none', () => {
        assert.deepEqual(Object.keys(BANNER_COPY), [...PROJECT_STATES]);
        for (const s of PROJECT_STATES) {
            const c = bannerCopy(s);
            assert.ok(c.title && c.body, s);
            const wantsAction = turnFor(s) === 'your-turn' || s === 'ON_HOLD';
            assert.equal(Boolean(c.actionLabel), wantsAction, s);
        }
    });

    test('the designer’s-turn bodies start “Nothing needed from you” (§2.5)', () => {
        for (const s of PROJECT_STATES.filter((x) => turnFor(x) === 'designers-turn')) assert.match(bannerCopy(s).body, /^Nothing needed from you\./, s);
    });

    test('§2.5 wording: approval, done, paused, closed', () => {
        assert.equal(bannerCopy('AWAITING_APPROVAL').title, 'Approved, final files being prepared');
        assert.equal(bannerCopy('DELIVERED').title, 'Complete');
        assert.match(bannerCopy('DELIVERED').body, /always here/);
        assert.equal(bannerCopy('ON_HOLD').title, 'Paused');
        assert.equal(bannerCopy('ON_HOLD').actionLabel, 'Check messages');
        assert.equal(bannerCopy('CANCELLED').title, 'Cancelled');
        assert.equal(bannerCopy('REFUNDED').title, 'Refunded');
    });

    test('no copy shows an internal state name or promises a turnaround time (owner item §15.2)', () => {
        for (const s of PROJECT_STATES) {
            const text = JSON.stringify(bannerCopy(s));
            for (const name of PROJECT_STATES) assert.ok(!text.includes(name), `${s} mentions ${name}`);
            assert.doesNotMatch(text, /working days?|\bwithin \d/i, s);
        }
        assert.ok(bannerCopy('NOT_A_STATE').body.startsWith('Nothing needed from you'));
    });

    test('the three celebrations sit on the states where those moments happen', () => {
        assert.deepEqual([...CELEBRATIONS], ['first-concepts', 'approved', 'final-files']);
        assert.equal(CELEBRATION_COPY['first-concepts'].state, 'CONCEPTS_READY');
        assert.equal(CELEBRATION_COPY.approved.state, 'AWAITING_APPROVAL');
        assert.equal(CELEBRATION_COPY['final-files'].state, 'FINAL_FILES_READY');
    });
});

describe('stage tracker: buildTimeline is Next’s, value for value', () => {
    test(`matches Next’s output for all ${NEXT.cases.length} reference cases`, () => {
        assert.ok(NEXT.cases.length >= 80);
        for (const c of NEXT.cases) {
            const ours = JSON.parse(JSON.stringify(buildTimeline(c.state, c.timestamps, c.options ?? undefined)));
            assert.deepEqual(ours, c.timeline, `${c.state} ${JSON.stringify(c.options)} ${Object.keys(c.timestamps).length ? 'with' : 'without'} timestamps`);
        }
    });

    test('every flow state has exactly one current step, and it is that state', () => {
        for (const s of PROJECT_STATES.filter((x) => !['ON_HOLD', 'CANCELLED', 'REFUNDED'].includes(x))) {
            const current = buildTimeline(s).filter((i) => i.current);
            assert.deepEqual(current.map((i) => i.state), [s]);
        }
    });

    test('trackerModel: done before current, upcoming after, no terminal', () => {
        const m = trackerModel(buildTimeline('REVISIONS_IN_PROGRESS'));
        assert.equal(m.terminal, null);
        assert.deepEqual(
            m.steps.map((s) => s.status),
            ['done', 'done', 'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'],
        );
        const done = trackerModel(buildTimeline('DELIVERED')).steps.map((s) => s.status);
        assert.deepEqual(done, [...Array(8).fill('done'), 'current']);
    });

    test('trackerModel: approved milestone current while final files are prepared', () => {
        const m = trackerModel(buildTimeline('AWAITING_APPROVAL', {}, { hasApprovedMilestone: true }));
        assert.equal(m.steps.find((s) => s.status === 'current')?.key, 'APPROVED');
        assert.equal(m.steps.find((s) => s.key === 'AWAITING_APPROVAL')?.status, 'done');
    });

    test('trackerModel: terminal states stop the flow at a marker, keeping timestamps', () => {
        for (const [state, kind, label] of [
            ['ON_HOLD', 'paused', 'On hold'],
            ['CANCELLED', 'cancelled', 'Cancelled'],
            ['REFUNDED', 'refunded', 'Refunded'],
        ] as const) {
            const m = trackerModel(buildTimeline(state, { IN_DESIGN: '2026-11-04T10:00:00Z', [state]: '2026-11-06T12:00:00Z' }));
            assert.deepEqual(m.terminal, { kind, label, timestamp: '2026-11-06T12:00:00Z' }, state);
            assert.equal(m.steps.length, 9);
            assert.equal(m.steps.find((s) => s.key === 'IN_DESIGN')?.timestamp, '2026-11-04T10:00:00Z');
            assert.equal(stepStatusText('upcoming', true), '');
        }
    });

    test('step status text says done / current / not started (never colour alone)', () => {
        assert.equal(stepStatusText('done', false), 'Done');
        assert.equal(stepStatusText('current', false), 'Current step');
        assert.equal(stepStatusText('upcoming', false), 'Not started yet');
    });

    test('dates read “18 Nov 2026” in UK time; missing or bad values give null', () => {
        assert.equal(formatDate('2026-11-18T15:45:00Z'), '18 Nov 2026');
        assert.equal(formatDate('2026-06-30T23:30:00Z'), '1 Jul 2026'); // BST
        assert.equal(formatDate('2026-12-31T23:30:00Z'), '31 Dec 2026'); // GMT
        assert.equal(formatDate(undefined), null);
        assert.equal(formatDate('not a date'), null);
    });
});

describe('allowance meter maths (UX §7, §11; Next resolveUsage)', () => {
    const R = { one: 'revision', many: 'revisions' };

    test('used, in progress and left; left = limit − used − in progress', () => {
        const v = allowanceView({ limit: 2, consumed: 0, reserved: 1 }, R);
        assert.deepEqual([v.used, v.inProgress, v.left, v.over], [0, 1, 1, 0]);
        assert.deepEqual(v.segments, ['in-progress', 'left']);
        assert.equal(v.headline, '1 left');
        assert.equal(v.legend, '1 of 2 revisions left · 0 used · 1 in progress');
    });

    test('used fills first, then in progress; none left says so', () => {
        const v = allowanceView({ limit: 3, consumed: 1, reserved: 2 }, R);
        assert.deepEqual(v.segments, ['used', 'in-progress', 'in-progress']);
        assert.equal(v.headline, 'None left');
        assert.equal(v.left, 0);
    });

    test('a limit of one uses the singular', () => {
        assert.equal(allowanceView({ limit: 1, consumed: 0 }, R).legend, '1 of 1 revision left · 0 used · 0 in progress');
    });

    test('unlimited: no segments or bar, the count used (and in progress when any)', () => {
        const v = allowanceView({ limit: 0, consumed: 3, reserved: 0, unlimited: true }, { one: 'concept', many: 'concepts' });
        assert.equal(v.headline, 'Unlimited');
        assert.equal(v.segments, null);
        assert.equal(v.bar, null);
        assert.equal(v.legend, 'Unlimited concepts · 3 used');
        assert.equal(allowanceView({ limit: 0, consumed: 4, reserved: 1, unlimited: true }, R).legend, 'Unlimited revisions · 4 used · 1 in progress');
    });

    test(`more than ${MAX_SEGMENTS} slots become a proportional bar`, () => {
        assert.equal(allowanceView({ limit: MAX_SEGMENTS, consumed: 1 }, R).segments?.length, MAX_SEGMENTS);
        const v = allowanceView({ limit: 20, consumed: 7, reserved: 2 }, R);
        assert.equal(v.segments, null);
        assert.deepEqual(v.bar, { used: 0.35, inProgress: 0.1, left: 0.55 });
    });

    test('a limit set below usage (admin override, allowed) fills every slot and counts the overage', () => {
        const v = allowanceView({ limit: 1, consumed: 2, reserved: 1 }, R);
        assert.deepEqual(v.segments, ['used']);
        assert.equal(v.left, 0);
        assert.equal(v.over, 2);
        assert.match(v.legend, /2 over the limit$/);
    });

    test('bad input clamps to zero like Next (negative, fractional, missing)', () => {
        const v = allowanceView({ limit: -3, consumed: -1, reserved: Number.NaN }, R);
        assert.deepEqual([v.limit, v.used, v.inProgress, v.left], [0, 0, 0, 0]);
        assert.equal(v.segments, null);
        assert.equal(allowanceView(undefined).headline, 'None left');
        assert.equal(allowanceView({ limit: 2.9, consumed: 0.5 }, R).limit, 2);
    });

    test('left agrees with Next’s remaining = max(limit − consumed − reserved, 0)', () => {
        for (let limit = 0; limit <= 4; limit++)
            for (let consumed = 0; consumed <= 5; consumed++)
                for (let reserved = 0; reserved <= 3; reserved++) {
                    assert.equal(allowanceView({ limit, consumed, reserved }).left, Math.max(limit - consumed - reserved, 0));
                }
    });
});

describe('skeleton', () => {
    test('row count is clamped to 1–8, default 3', () => {
        assert.equal(skeletonRows(undefined), 3);
        assert.equal(skeletonRows(0), 1);
        assert.equal(skeletonRows(20), 8);
        assert.equal(skeletonRows(2.7), 2);
    });
});
