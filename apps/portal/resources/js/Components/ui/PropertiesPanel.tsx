import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/Components/ui/Button';
import { LoadingBlock, Panel } from '@/Components/ui/Card';
import { Field } from '@/Components/ui/Field';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Input } from '@/Components/ui/Input';
import { cx } from '@/lib/ui';

/**
 * UX §11 Properties panel (admin; story 1.8c): a label/value list (<dl>) on the sunken properties
 * column (§5.2), with inline edit for the editable ones (entitlement overrides, Epic 8).
 * - "Edit" swaps the value for a labelled input with Save and Cancel; Esc cancels; focus goes to
 *   the input, and back to Edit afterwards. The typed value is kept on error (§12).
 * - Saving keeps a label ("Saving…"); the editor closes when `saving` ends without an `error`.
 * - States: loading (placeholder), error (+ retry), and a property with no value says so ("Not set").
 */
export type PropertyEdit = {
    value: string;
    /** The input's label (defaults to the property label). */
    inputLabel?: string;
    hint?: ReactNode;
    type?: 'text' | 'number';
    onSave: (value: string) => void;
    saving?: boolean;
    error?: string | null;
};

export type Property = {
    key: string;
    label: string;
    value: ReactNode;
    /** IDs, order references (§8.2 mono). */
    mono?: boolean;
    edit?: PropertyEdit;
};

type Props = {
    title: string;
    properties: readonly Property[];
    actions?: ReactNode;
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    level?: 2 | 3;
};

export function PropertiesPanel({ title, properties, actions, loading = false, error, onRetry, level = 2 }: Props) {
    return (
        <Panel title={title} tone="sunken" actions={actions} level={level}>
            {error ? (
                <InlineAlert tone="danger" title="We couldn’t load these details" action={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : undefined}>
                    {error}
                </InlineAlert>
            ) : null}
            {loading && properties.length === 0 ? (
                <div aria-busy="true">
                    <span className="sr-only">Loading {title.toLowerCase()}</span>
                    <div aria-hidden="true" className="flex flex-col gap-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex flex-col gap-2">
                                <LoadingBlock className="h-3 w-20 bg-divider" />
                                <LoadingBlock className="h-4 w-40 bg-divider" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <dl className="flex flex-col divide-y divide-divider">
                    {properties.map((p) => (
                        <PropertyRow key={p.key} property={p} />
                    ))}
                </dl>
            )}
        </Panel>
    );
}

function PropertyRow({ property }: { property: Property }) {
    const { label, value, mono, edit } = property;
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(edit?.value ?? '');
    const editButton = useRef<HTMLButtonElement>(null);
    const inputWrap = useRef<HTMLDivElement>(null);
    const wasSaving = useRef(false);
    const returnFocus = useRef(false);

    const close = () => {
        returnFocus.current = true;
        setEditing(false);
    };

    // Close once a save finishes cleanly.
    useEffect(() => {
        if (wasSaving.current && !edit?.saving && !edit?.error) close();
        wasSaving.current = Boolean(edit?.saving);
    }, [edit?.saving, edit?.error]);

    useEffect(() => {
        if (editing) inputWrap.current?.querySelector('input')?.focus();
        else if (returnFocus.current) {
            returnFocus.current = false;
            editButton.current?.focus();
        }
    }, [editing]);

    const empty = value === null || value === undefined || value === '';
    return (
        <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <dt className="text-sm text-fg-2">{label}</dt>
            <dd className="m-0">
                {edit && editing ? (
                    <form
                        className="flex flex-col gap-3 pt-1"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!edit.saving) edit.onSave(draft);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape' && !edit.saving) {
                                e.preventDefault();
                                close();
                            }
                        }}
                    >
                        <div ref={inputWrap}>
                            <Field label={edit.inputLabel ?? label} hint={edit.hint} error={edit.error}>
                                <Input type={edit.type ?? 'text'} value={draft} onChange={(e) => setDraft(e.currentTarget.value)} inputMode={edit.type === 'number' ? 'numeric' : undefined} />
                            </Field>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button type="submit" size="sm" variant="primary" loading={edit.saving} loadingLabel="Saving…">
                                Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={close} disabledReason={edit.saving ? 'Wait for the save to finish.' : null}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="flex items-start justify-between gap-3">
                        <span className={cx('min-w-0 text-base break-words', mono && 'font-mono text-sm', empty ? 'text-fg-3' : 'text-fg')}>{empty ? 'Not set' : value}</span>
                        {edit ? (
                            <button
                                ref={editButton}
                                type="button"
                                onClick={() => {
                                    setDraft(edit.value);
                                    setEditing(true);
                                }}
                                className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-sm px-2 text-sm font-medium text-accent-text hover:bg-surface pointer-coarse:min-h-11"
                            >
                                <Pencil aria-hidden="true" size={16} strokeWidth={1.5} />
                                Edit<span className="sr-only"> {label.toLowerCase()}</span>
                            </button>
                        ) : null}
                    </div>
                )}
            </dd>
        </div>
    );
}
