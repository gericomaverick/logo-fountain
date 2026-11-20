import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { Button } from '@/Components/ui/Button';
import { EmptyState } from '@/Components/ui/EmptyState';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Skeleton } from '@/Components/ui/Skeleton';
import { nextSort, rowIndexForKey, sortRows, type SortDirection, type SortValue } from '@/lib/media';
import { cx } from '@/lib/ui';

/**
 * UX §11 Data table / list row (admin; story 1.8c): dense, sortable, row reason chips, keyboard
 * row navigation.
 * - A real <table> with a caption (its name). Sortable headers are buttons; the sorted column
 *   has aria-sort and an arrow (state is never the icon alone: the button's name says it).
 * - Row navigation: rows are one tab stop (roving tabindex); ArrowUp/ArrowDown/Home/End move
 *   between rows, Enter opens the row (`onOpen`). Each row should also hold a real link (e.g. the
 *   project name) for screen-reader and pointer users.
 * - `reasons` render as chips ("2 revision requests", "New message"): text, so not colour alone.
 * - States: loading (placeholder rows), error (alert + retry; rows already shown are kept),
 *   empty, partial (`partialNote`, e.g. "Showing 20 of 24: 4 couldn't load").
 * - Wide tables scroll sideways inside their box on narrow screens (§13 reflow); the sort
 *   buttons and rows inside keep it keyboard-reachable.
 */
export type Column<T> = {
    key: string;
    header: string;
    cell: (row: T) => ReactNode;
    /** Makes the column sortable. */
    sortValue?: (row: T) => SortValue;
    align?: 'start' | 'end';
    /** Visually hide the header (it still names the column), e.g. an actions column. */
    hideHeader?: boolean;
};

type Props<T> = {
    caption: string;
    /** Visually hide the caption when a heading above already names the table. */
    hideCaption?: boolean;
    columns: readonly Column<T>[];
    rows: readonly T[];
    rowKey: (row: T) => string;
    /** Chips shown under the first cell. */
    reasons?: (row: T) => readonly string[];
    onOpen?: (row: T) => void;
    defaultSort?: { key: string; direction: SortDirection };
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    empty?: ReactNode;
    partialNote?: ReactNode;
};

export function DataTable<T>({ caption, hideCaption = false, columns, rows, rowKey, reasons, onOpen, defaultSort, loading = false, error, onRetry, empty, partialNote }: Props<T>) {
    const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(defaultSort ?? null);
    const [active, setActive] = useState(0);
    const body = useRef<HTMLTableSectionElement>(null);

    const sorted = useMemo(() => {
        const column = sort && columns.find((c) => c.key === sort.key);
        return column?.sortValue && sort ? sortRows(rows, column.sortValue, sort.direction) : [...rows];
    }, [rows, columns, sort]);
    const activeIndex = Math.min(active, Math.max(0, sorted.length - 1));

    const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, index: number, row: T) => {
        if (event.target !== event.currentTarget) return; // keys inside a link or button are theirs
        if (event.key === 'Enter' && onOpen) {
            event.preventDefault();
            onOpen(row);
            return;
        }
        const next = rowIndexForKey(event.key, index, sorted.length);
        if (next === null) return;
        event.preventDefault();
        setActive(next);
        body.current?.querySelectorAll<HTMLTableRowElement>(':scope > tr')[next]?.focus();
    };

    const showPlaceholder = loading && rows.length === 0;
    return (
        <div className="flex flex-col gap-3">
            {error ? (
                <InlineAlert tone="danger" title="We couldn’t load this list" action={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : undefined}>
                    {error}
                </InlineAlert>
            ) : null}
            {partialNote && !error ? <InlineAlert tone="warning">{partialNote}</InlineAlert> : null}
            <div className="overflow-x-auto rounded-md border border-divider bg-surface">
                <table className="w-full border-collapse text-sm" aria-busy={showPlaceholder || undefined}>
                    <caption className={hideCaption ? 'sr-only' : 'px-4 pt-3 pb-2 text-left text-base font-semibold text-fg'}>{caption}</caption>
                    <thead className="bg-sunken">
                        <tr>
                            {columns.map((c) => {
                                const sorted = sort?.key === c.key ? sort.direction : undefined;
                                return (
                                    <th
                                        key={c.key}
                                        scope="col"
                                        aria-sort={c.sortValue ? (sorted ?? 'none') : undefined}
                                        className={cx('px-4 py-2 font-medium whitespace-nowrap text-fg-2', c.align === 'end' ? 'text-right' : 'text-left')}
                                    >
                                        {c.hideHeader ? (
                                            <span className="sr-only">{c.header}</span>
                                        ) : c.sortValue ? (
                                            <button
                                                type="button"
                                                onClick={() => setSort(nextSort(sort, c.key))}
                                                className={cx('-mx-2 inline-flex min-h-8 items-center gap-1 rounded-sm px-2 hover:bg-surface hover:text-fg pointer-coarse:min-h-11', sorted && 'text-fg')}
                                            >
                                                {c.header}
                                                {sorted === 'ascending' ? (
                                                    <ArrowUp aria-hidden="true" size={16} strokeWidth={1.5} />
                                                ) : sorted === 'descending' ? (
                                                    <ArrowDown aria-hidden="true" size={16} strokeWidth={1.5} />
                                                ) : (
                                                    <ArrowUpDown aria-hidden="true" size={16} strokeWidth={1.5} className="text-fg-3" />
                                                )}
                                                <span className="sr-only">{sorted ? `, sorted ${sorted}` : ', sort'}</span>
                                            </button>
                                        ) : (
                                            c.header
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody ref={body}>
                        {showPlaceholder ? (
                            <tr className="border-t border-divider">
                                <td colSpan={columns.length} className="px-4">
                                    <Skeleton variant="list" what="rows" count={3} />
                                </td>
                            </tr>
                        ) : sorted.length === 0 ? (
                            <tr className="border-t border-divider">
                                <td colSpan={columns.length} className="px-4 py-6 text-center text-base text-fg-2">
                                    {empty ?? <EmptyState as="h3" title="Nothing here yet" />}
                                </td>
                            </tr>
                        ) : (
                            sorted.map((row, index) => {
                                const chips = reasons?.(row) ?? [];
                                return (
                                    <tr
                                        key={rowKey(row)}
                                        tabIndex={index === activeIndex ? 0 : -1}
                                        onFocus={() => setActive(index)}
                                        onKeyDown={(e) => onRowKey(e, index, row)}
                                        className="border-t border-divider align-top transition-colors hover:bg-sunken focus-visible:bg-accent-soft focus-visible:-outline-offset-2"
                                    >
                                        {columns.map((c, ci) => (
                                            <td key={c.key} className={cx('px-4 py-3 text-fg', c.align === 'end' && 'text-right tabular-nums')}>
                                                {c.cell(row)}
                                                {ci === 0 && chips.length > 0 ? (
                                                    <ul aria-label="Why it needs action" className="mt-2 flex flex-wrap gap-1">
                                                        {chips.map((chip) => (
                                                            <li key={chip} className="rounded-sm bg-warning-soft px-2 py-0.5 text-xs font-medium text-fg">
                                                                {chip}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
