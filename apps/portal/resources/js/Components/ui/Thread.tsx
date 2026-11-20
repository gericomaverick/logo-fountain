import { CircleAlert, Send } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';

import { Button } from '@/Components/ui/Button';
import { LoadingBlock } from '@/Components/ui/Card';
import { Field } from '@/Components/ui/Field';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Textarea } from '@/Components/ui/Textarea';
import { groupMessagesByDay, resolveSenderLabel, shouldSendOnKey, sortMessagesNewestLast, type ChatSender } from '@/lib/chat-messages';
import { formatTime } from '@/lib/media';
import { cx } from '@/lib/ui';

/**
 * UX §11 Thread (messages + concept feedback; story 1.8c): bubbles for you / the designer /
 * others, system events as subtle centred lines (not bubbles), day separators ("Today",
 * "Yesterday", "Tuesday 17 November"), and a composer.
 * - Oldest first, newest at the bottom; new messages are appended, so nothing moves under the
 *   reader (UX §12). Announce them with usePolling + PollingStatus, not here (no double speech).
 * - Labels, ordering, day groups and Enter-to-send come from lib/chat-messages (ported unchanged
 *   from Next). `today` is passed in so screenshots and tests are stable.
 * - States: loading (placeholder), error (+ retry, messages kept), empty, partial (a message that
 *   is still sending, or failed with "Try again").
 */
export type ThreadMessage = {
    id: string;
    kind?: 'message' | 'system';
    body: string;
    createdAt: string;
    sender: ChatSender;
    /** Local states for the viewer's own messages. */
    delivery?: 'sending' | 'failed';
};

type ThreadProps = {
    /** The list's accessible name, e.g. "Messages with your designer". */
    label: string;
    messages: readonly ThreadMessage[];
    viewerId: string;
    today: Date;
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    onResend?: (id: string) => void;
    empty?: ReactNode;
};

export function Thread({ label, messages, viewerId, today, loading = false, error, onRetry, onResend, empty }: ThreadProps) {
    if (loading && messages.length === 0) {
        return (
            <div aria-busy="true" className="flex flex-col gap-4">
                <span className="sr-only">Loading messages</span>
                <div aria-hidden="true" className="flex flex-col gap-4">
                    <LoadingBlock className="h-16 w-3/4 rounded-lg" />
                    <LoadingBlock className="ml-auto h-12 w-2/3 rounded-lg" />
                    <LoadingBlock className="h-10 w-1/2 rounded-lg" />
                </div>
            </div>
        );
    }

    const days = groupMessagesByDay(sortMessagesNewestLast([...messages]), today);
    return (
        <div className="flex flex-col gap-4">
            {error ? (
                <InlineAlert tone="danger" title="We couldn’t load new messages" action={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : undefined}>
                    {error}
                </InlineAlert>
            ) : null}
            {days.length === 0 && !error ? (
                (empty ?? <p className="text-base text-fg-2">No messages yet. Say hello to your designer.</p>)
            ) : (
                <ol aria-label={label} className="flex flex-col gap-6">
                    {days.map((day) => (
                        <li key={day.key} className="flex flex-col gap-3">
                            <h3 className="flex items-center gap-3 text-sm font-medium text-fg-3 before:h-px before:flex-1 before:bg-divider after:h-px after:flex-1 after:bg-divider">
                                {day.label}
                            </h3>
                            <ol className="flex flex-col gap-3">
                                {day.messages.map((m) => (
                                    <MessageItem key={m.id} message={m} viewerId={viewerId} onResend={onResend} />
                                ))}
                            </ol>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

function MessageItem({ message, viewerId, onResend }: { message: ThreadMessage; viewerId: string; onResend?: ((id: string) => void) | undefined }) {
    const time = formatTime(message.createdAt);
    if (message.kind === 'system') {
        return (
            <li data-kind="system" className="px-6 text-center text-sm text-fg-2">
                <span>{message.body}</span>
                {time ? <span className="text-fg-3"> · {time}</span> : null}
            </li>
        );
    }
    const mine = message.sender.id === viewerId;
    const who = resolveSenderLabel(message.sender, viewerId);
    return (
        <li data-kind={mine ? 'mine' : message.sender.isAdmin ? 'designer' : 'other'} className={cx('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
            <p className="flex items-baseline gap-2 text-sm">
                <span className="font-medium text-fg">{who}</span>
                {time ? <time dateTime={message.createdAt} className="text-fg-3">{time}</time> : null}
            </p>
            <div
                className={cx(
                    'max-w-[min(36rem,85%)] rounded-lg px-4 py-3 text-base break-words whitespace-pre-wrap',
                    mine ? 'rounded-br-sm bg-accent-soft text-fg' : 'rounded-bl-sm border border-divider bg-surface text-fg',
                    message.delivery === 'sending' && 'opacity-70',
                )}
            >
                {message.body}
            </div>
            {message.delivery === 'sending' ? <p className="text-sm text-fg-3">Sending…</p> : null}
            {message.delivery === 'failed' ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-danger">
                    <CircleAlert aria-hidden="true" size={16} strokeWidth={1.5} />
                    <span>Not sent.</span>
                    {onResend ? (
                        <button type="button" onClick={() => onResend(message.id)} className="min-h-6 rounded-sm font-medium text-accent-text underline underline-offset-2 pointer-coarse:min-h-11">
                            Try again
                        </button>
                    ) : null}
                </p>
            ) : null}
        </li>
    );
}

type ComposerProps = {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    sending?: boolean;
    /** A plain-language send error; the typed text is kept (UX §12). */
    error?: string | null;
    /** The send button's label ("Send", "Send a comment"). */
    sendLabel?: string;
    disabledReason?: string | null;
};

/** The thread composer: Enter sends, Shift+Enter adds a line (lib/chat-messages shouldSendOnKey). */
export function ThreadComposer({ label = 'Message', value, onChange, onSend, sending = false, error, sendLabel = 'Send', disabledReason }: ComposerProps) {
    const empty = value.trim() === '';
    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        if (sending || empty || disabledReason) return;
        onSend();
    };
    return (
        <form onSubmit={submit} className="flex flex-col gap-3">
            {error ? (
                <InlineAlert tone="danger" announce>
                    {error}
                </InlineAlert>
            ) : null}
            <Field label={label} hint="Press Enter to send, Shift+Enter for a new line.">
                <Textarea
                    rows={3}
                    value={value}
                    onChange={(e) => onChange(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (shouldSendOnKey({ key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, isComposing: e.nativeEvent.isComposing })) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                />
            </Field>
            <div className="flex justify-end">
                <Button
                    type="submit"
                    variant="primary"
                    icon={<Send aria-hidden size={16} strokeWidth={1.5} />}
                    loading={sending}
                    loadingLabel="Sending…"
                    disabledReason={disabledReason ?? (empty ? 'Write a message first.' : null)}
                    width="phone"
                >
                    {sendLabel}
                </Button>
            </div>
        </form>
    );
}
