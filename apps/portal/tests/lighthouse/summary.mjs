// Prints each Lighthouse run's NFR-P2 numbers and their median (story 1.9), from .lighthouseci/lhr-*.json.
// The pass/fail decision is `lhci assert` (lighthouserc.json); this is the readable record for the log.
import { readdirSync, readFileSync } from 'node:fs';

const dir = '.lighthouseci';
const runs = readdirSync(dir)
    .filter((f) => /^lhr-.*\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));

const metric = (lhr, id) => lhr.audits[id]?.numericValue;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const rows = runs.map((lhr) => ({
    url: lhr.finalDisplayedUrl,
    formFactor: lhr.configSettings.formFactor,
    throttling: lhr.configSettings.throttlingMethod,
    lcpMs: Math.round(metric(lhr, 'largest-contentful-paint')),
    cls: Number(metric(lhr, 'cumulative-layout-shift').toFixed(4)),
    fcpMs: Math.round(metric(lhr, 'first-contentful-paint')),
    tbtMs: Math.round(metric(lhr, 'total-blocking-time')),
    performance: Math.round((lhr.categories.performance?.score ?? 0) * 100),
}));
console.table(rows);
if (rows.length) {
    console.log(
        `median of ${rows.length}: LCP ${median(rows.map((r) => r.lcpMs))} ms (budget 2500), CLS ${median(rows.map((r) => r.cls))} (budget 0.1), ` +
            `FCP ${median(rows.map((r) => r.fcpMs))} ms, TBT ${median(rows.map((r) => r.tbtMs))} ms, performance ${median(rows.map((r) => r.performance))}`,
    );
}
