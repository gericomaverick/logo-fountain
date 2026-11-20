import { useEffect, useId, useRef } from 'react';

/**
 * UX §12 Forms: "the error summary appears at the top on submit". A danger panel listing each
 * error as a link to its field (Field `id`), focused when it appears so keyboard and screen-reader
 * users land on it (focus does the announcing, so no role=alert to avoid reading it twice). Render it only after a failed submit; the Field errors stay too.
 */
export type SummaryError = { fieldId: string; message: string };

type Props = { errors: readonly SummaryError[]; title?: string };

export function ErrorSummary({ errors, title = 'There is a problem' }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const count = errors.length;

    useEffect(() => {
        if (count > 0) ref.current?.focus();
    }, [count]);

    if (count === 0) return null;
    return (
        <div ref={ref} tabIndex={-1} role="region" aria-labelledby={titleId} className="flex flex-col gap-2 rounded-md border border-danger bg-danger-soft p-4">
            <h2 id={titleId} className="text-lg font-semibold text-danger">
                {title}
            </h2>
            <ul className="flex flex-col gap-1">
                {errors.map((e) => (
                    <li key={e.fieldId}>
                        <a
                            href={`#${e.fieldId}`}
                            onClick={(event) => {
                                const field = document.getElementById(e.fieldId);
                                if (!field) return;
                                event.preventDefault();
                                field.focus();
                                field.scrollIntoView({ block: 'center' });
                            }}
                            className="rounded-sm text-base text-danger underline decoration-1 underline-offset-2 hover:decoration-2"
                        >
                            {e.message}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}
