import { router } from '@inertiajs/react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/Components/ui/Button';
import { Field } from '@/Components/ui/Field';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Link } from '@/Components/ui/Link';
import { Textarea } from '@/Components/ui/Textarea';
import { Thread, type ThreadMessage } from '@/Components/ui/Thread';
import { feedbackError, revisionBlock, revisionPreview, type RevisionUsage } from '@/lib/concepts';

/**
 * Story 6.8 UI half (C-10, C-11, K-14; UX §3, §12): the concept's feedback thread (comments and revision requests
 * together, as Next) and one composer with two different outcomes: "Send comment" (free) and "Request a revision"
 * (uses one, previewed before sending). Not for approved or archived concepts (Next hides it). Approve is 6.9.
 */
type Comment = { id: string; body: string; createdAt: string; author: { id: string; email: string; fullName: string | null; isAdmin: boolean } };
export type RevisionItem = { id: string; status: string; body: string; createdAt: string; concept: { id: string } | null; user: { email: string; fullName: string | null } };

type Props = {
    projectId: string;
    conceptId: string;
    conceptStatus: string;
    projectStatus: string;
    usage: RevisionUsage | null | undefined;
    requests: readonly RevisionItem[];
    viewerEmail: string;
    overviewHref: string;
    /** Fixed "now" for the day labels, for stable tests. */
    today?: Date;
};

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

export function ConceptFeedback({ projectId, conceptId, conceptStatus, projectStatus, usage, requests, viewerEmail, overviewHref, today }: Props) {
    const [comments, setComments] = useState<Comment[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState<'comment' | 'revision' | null>(null);
    const [error, setError] = useState<{ message: string; upsell: boolean } | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const open = conceptStatus === 'published';
    const url = `/api/projects/${projectId}/concepts/${conceptId}/comments`;

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            const payload = (await res.json().catch(() => null)) as { comments?: Comment[] } | null;
            if (!res.ok) throw new Error(feedbackError(payload, 'Please try again.').message);
            setComments(payload?.comments ?? []);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'Please try again.');
        }
    }, [url]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from an external system; state is set after the await
        void load();
    }, [load]);

    const send = async (kind: 'comment' | 'revision') => {
        if (busy || text.trim() === '') return;
        setBusy(kind);
        setError(null);
        setDone(null);
        try {
            const res = await fetch(kind === 'comment' ? url : `/api/projects/${projectId}/revision-requests`, {
                method: 'POST',
                headers: JSON_HEADERS,
                credentials: 'same-origin',
                body: JSON.stringify(kind === 'comment' ? { body: text.trim() } : { body: text.trim(), conceptId }),
            });
            const payload = (await res.json().catch(() => null)) as unknown;
            if (!res.ok) {
                setError(feedbackError(payload, kind === 'comment' ? 'We couldn’t send your comment. Please try again.' : 'We couldn’t send your revision request. Please try again.'));
                // The allowance or the status may have moved: refresh them, keep the typed text.
                if (kind === 'revision') router.reload({ only: ['snapshot'] });
            } else {
                setText('');
                setDone(kind === 'comment' ? 'Comment sent.' : 'Revision requested. Your designer will review it and work on the next version.');
                if (kind === 'comment') await load();
                else router.reload({ only: ['snapshot'] });
            }
        } catch {
            setError({ message: 'We couldn’t reach the server. Your text is still here: please try again.', upsell: false });
        } finally {
            setBusy(null);
        }
    };

    const messages: ThreadMessage[] = [
        ...(comments ?? []).map((c) => ({ id: `c-${c.id}`, body: c.body, createdAt: c.createdAt, sender: { id: c.author.email, email: c.author.email, fullName: c.author.fullName, isAdmin: c.author.isAdmin } })),
        ...requests
            .filter((r) => r.concept?.id === conceptId)
            .map((r) => ({ id: `r-${r.id}`, body: `Revision requested: ${r.body}`, createdAt: r.createdAt, sender: { id: r.user.email, email: r.user.email, fullName: r.user.fullName } })),
    ];

    if (!open) {
        return (
            <section aria-labelledby="feedback-title" className="flex flex-col gap-4">
                <h2 id="feedback-title" className="text-lg font-semibold text-fg">Feedback</h2>
                <p className="text-base text-fg-2">{conceptStatus === 'approved' ? 'This concept is approved, so it no longer takes feedback.' : 'This concept is archived, so it no longer takes feedback.'}</p>
            </section>
        );
    }

    const block = revisionBlock(conceptStatus, projectStatus, usage);
    const upsell = error?.upsell || block?.upsell;
    const empty = text.trim() === '';
    return (
        <section aria-labelledby="feedback-title" className="flex flex-col gap-4">
            <h2 id="feedback-title" className="text-lg font-semibold text-fg">Feedback</h2>
            <Thread
                label="Feedback on this concept"
                messages={messages}
                viewerId={viewerEmail}
                today={today ?? new Date()}
                loading={comments === null && !loadError}
                error={loadError}
                onRetry={() => void load()}
                empty={<p className="text-base text-fg-2">No feedback on this concept yet.</p>}
            />
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void send('comment');
                }}
                className="flex flex-col gap-3"
            >
                {error ? (
                    <InlineAlert tone="danger" announce>
                        {error.message}
                    </InlineAlert>
                ) : null}
                {done ? <InlineAlert tone="success" announce>{done}</InlineAlert> : null}
                <Field label="Your feedback" hint="A comment is free. A revision request asks your designer for a new version and uses one of your revisions.">
                    <Textarea rows={4} maxLength={5000} value={text} onChange={(e) => setText(e.currentTarget.value)} />
                </Field>
                <p className="text-sm text-fg-2" data-testid="revision-preview">
                    {block && !block.upsell ? block.reason : revisionPreview(usage)}
                    {upsell ? (
                        <>
                            {' '}
                            <Link href={overviewHref}>Add a revision on your project overview</Link>
                        </>
                    ) : null}
                </p>
                <div className="flex flex-wrap justify-end gap-3">
                    <Button type="submit" variant="secondary" loading={busy === 'comment'} loadingLabel="Sending…" disabledReason={busy === 'revision' ? 'Sending your revision request…' : empty ? 'Write your feedback first.' : null} width="phone">
                        Send comment
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        onClick={() => void send('revision')}
                        loading={busy === 'revision'}
                        loadingLabel="Sending…"
                        disabledReason={busy === 'comment' ? 'Sending your comment…' : (block?.reason ?? (empty ? 'Write your feedback first.' : null))}
                        width="phone"
                    >
                        Request a revision
                    </Button>
                </div>
            </form>
        </section>
    );
}
