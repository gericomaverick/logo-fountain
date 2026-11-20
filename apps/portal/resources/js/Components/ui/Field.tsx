import { CircleAlert } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';

import { characterCount, cx, describedBy } from '@/lib/ui';

/**
 * UX §11 Form field: label + control + help + error + counter (§12 Forms: labels above the field,
 * help and error below; errors are linked with aria-describedby and announced; validate on blur
 * and submit, never while typing). The control inside (Input, Textarea, Select) reads its id,
 * aria-describedby and aria-invalid from this context, so it can't be left unlabelled.
 */
export type FieldControlProps = {
    id: string;
    'aria-describedby'?: string | undefined;
    'aria-invalid'?: true | undefined;
    invalid: boolean;
};

const FieldContext = createContext<FieldControlProps | null>(null);

/** For Input/Textarea/Select: their wiring inside a Field (a control outside a Field is a bug). */
export function useFieldControl(): FieldControlProps {
    const ctx = useContext(FieldContext);
    if (!ctx) throw new Error('Input, Textarea and Select must be rendered inside a <Field>.');
    return ctx;
}

type FieldProps = {
    label: ReactNode;
    /** Help text under the control (fg-3). */
    hint?: ReactNode;
    /** The error message (plain language, §12). Its presence marks the control invalid. */
    error?: string | null | undefined;
    /** A character counter where there's a limit (§11, brief fields). */
    count?: { length: number; max: number } | undefined;
    /** Overrides the generated control id (e.g. for an error summary link). */
    id?: string;
    children: ReactNode;
};

export function Field({ label, hint, error, count, id, children }: FieldProps) {
    const generated = useId();
    const controlId = id ?? `field${generated}`;
    const hintId = `${controlId}-hint`;
    const errorId = `${controlId}-error`;
    const countId = `${controlId}-count`;
    const counter = count ? characterCount(count.length, count.max) : null;
    const invalid = Boolean(error) || Boolean(counter?.over);

    const control: FieldControlProps = {
        id: controlId,
        'aria-describedby': describedBy(hint ? hintId : null, error ? errorId : null, counter ? countId : null),
        'aria-invalid': invalid || undefined,
        invalid,
    };

    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={controlId} className="text-sm font-medium text-fg">
                {label}
            </label>
            <FieldContext.Provider value={control}>{children}</FieldContext.Provider>
            {hint ? (
                <p id={hintId} className="text-sm text-fg-3">
                    {hint}
                </p>
            ) : null}
            {error ? <FieldError id={errorId}>{error}</FieldError> : null}
            {counter ? <Counter id={countId} text={counter.text} over={counter.over} announce={counter.announce} /> : null}
        </div>
    );
}

/** An error line: icon plus text (never colour alone, §8.1), with a hidden "Error:" prefix. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
    return (
        <p id={id} className="flex items-start gap-2 text-base text-danger">
            <CircleAlert aria-hidden="true" size={20} strokeWidth={1.5} className="mt-0.5 shrink-0" />
            <span>
                <span className="sr-only">Error: </span>
                {children}
            </span>
        </p>
    );
}

function Counter({ id, text, over, announce }: { id: string; text: string; over: boolean; announce: boolean }) {
    // The visible counter is read with the field (aria-describedby). Near or past the limit, a
    // polite live region repeats it once typing pauses, so it isn't announced on every keystroke.
    const [spoken, setSpoken] = useState('');
    useEffect(() => {
        const timer = window.setTimeout(() => setSpoken(announce ? text : ''), 600);
        return () => window.clearTimeout(timer);
    }, [announce, text]);

    return (
        <>
            <p id={id} className={cx('text-sm', over ? 'font-medium text-danger' : 'text-fg-3')}>
                {text}
            </p>
            <span className="sr-only" aria-live="polite">
                {spoken}
            </span>
        </>
    );
}

/** Shared input look (§8: surface, 3:1 `border`, sm radius, 16 px+ text so iOS doesn't zoom). */
export function controlClass(invalid: boolean): string {
    return cx(
        'w-full min-h-11 rounded-sm border bg-surface px-3 py-2 text-base text-fg transition-colors placeholder:text-fg-3',
        'hover:border-fg-2 disabled:cursor-not-allowed disabled:border-divider disabled:bg-sunken disabled:text-fg-3',
        'read-only:border-divider read-only:bg-sunken read-only:hover:border-divider',
        invalid ? 'border-danger hover:border-danger' : 'border-border',
    );
}

type GroupProps = {
    legend: ReactNode;
    hint?: ReactNode;
    error?: string | null | undefined;
    /** Visually hide the legend (it is still the group's accessible name), e.g. the theme switcher. */
    hideLegend?: boolean;
    /** Renders the options; gets whether the group is in error (for the control borders). */
    children: (invalid: boolean) => ReactNode;
    layout?: 'stack' | 'wrap';
};

/** A fieldset with legend, help and error, for Radio group, Choice chips and checkbox sets. */
export function FieldGroup({ legend, hint, error, hideLegend = false, children, layout = 'stack' }: GroupProps) {
    const id = useId();
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const invalid = Boolean(error);
    return (
        <fieldset aria-describedby={describedBy(hint ? hintId : null, error ? errorId : null)} className="flex min-w-0 flex-col gap-2">
            <legend className={hideLegend ? 'sr-only' : 'mb-2 text-sm font-medium text-fg'}>{legend}</legend>
            {hint ? (
                <p id={hintId} className="-mt-1 text-sm text-fg-3">
                    {hint}
                </p>
            ) : null}
            <div className={layout === 'wrap' ? 'flex flex-wrap gap-2' : 'flex flex-col gap-1'}>
                {children(invalid)}
            </div>
            {error ? <FieldError id={errorId}>{error}</FieldError> : null}
        </fieldset>
    );
}
