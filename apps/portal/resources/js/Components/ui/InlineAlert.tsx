import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { alertToneLabel, cx, type AlertTone } from '@/lib/ui';

/**
 * UX §11 Inline alert: info · success · warning · danger, for page-level states (e.g. "Confirming
 * your purchase…"). Icon plus a hidden tone label plus text: colour never carries meaning alone.
 * `announce` makes it a live region (danger → role=alert, others → role=status) for alerts that
 * appear or change after the page loads; a static alert on first render doesn't need it.
 */
type Props = {
    tone: AlertTone;
    title?: ReactNode;
    children?: ReactNode;
    /** E.g. a Button or Link with the next step. */
    action?: ReactNode;
    announce?: boolean;
};

const TONE = {
    info: { box: 'bg-accent-soft', icon: 'text-accent-text', Icon: Info },
    success: { box: 'bg-success-soft', icon: 'text-success', Icon: CircleCheck },
    warning: { box: 'bg-warning-soft', icon: 'text-warning', Icon: TriangleAlert },
    danger: { box: 'bg-danger-soft', icon: 'text-danger', Icon: CircleAlert },
} as const;

export function InlineAlert({ tone, title, children, action, announce = false }: Props) {
    const t = TONE[tone];
    const role = announce ? (tone === 'danger' ? 'alert' : 'status') : undefined;
    return (
        <div role={role} data-tone={tone} className={cx('flex items-start gap-3 rounded-md p-4', t.box)}>
            <t.Icon aria-hidden="true" size={20} strokeWidth={1.5} className={cx('mt-0.5 shrink-0', t.icon)} />
            <div className="flex min-w-0 flex-col gap-1 text-base text-fg">
                <span className="sr-only">{alertToneLabel(tone)}: </span>
                {title ? <p className="font-semibold">{title}</p> : null}
                {children ? <div>{children}</div> : null}
                {action ? <div className="mt-2">{action}</div> : null}
            </div>
        </div>
    );
}
