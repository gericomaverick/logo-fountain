import { router } from '@inertiajs/react';
import { useRef, useState } from 'react';

import { Button } from '@/Components/ui/Button';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Link } from '@/Components/ui/Link';
import { postAuth, takeMailboxProof } from '@/lib/auth';
import { safeAuthNextPath } from '@/lib/safe-next';
import { AuthShell } from '@/Layouts/AuthShell';

const MISSING = 'This sign-in link is missing or expired. Request a new sign-in link to continue.';

/** A-05: the page never confirms by itself (mail scanners open links); only the button posts the token. */
export default function Callback() {
    const proof = useRef<{ token: string; next: string | null } | null>(null);
    proof.current ??= takeMailboxProof();
    const [failure, setFailure] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);


    async function confirm() {
        setFailure(null);
        if (!proof.current?.token) {
            setFailure(MISSING);
            return;
        }
        setBusy(true);
        const result = await postAuth('magic-link/verify', { token: proof.current.token });
        if (result.error) {
            setBusy(false);
            setFailure(result.error);
            return;
        }
        // Destination authorisation stays server-side; the next path is never trusted (A-13).
        router.visit(safeAuthNextPath(proof.current.next), { replace: true });
    }

    return (
        <AuthShell title="Complete sign-in">
            <p className="text-base text-fg-2">Confirm to finish signing in. This link works once and expires after an hour.</p>
            {failure ? (
                <InlineAlert tone="danger" announce>
                    {failure}
                </InlineAlert>
            ) : null}
            <Button variant="primary" width="full" loading={busy} loadingLabel="Confirming…" onClick={confirm}>
                Confirm sign-in
            </Button>
            <p className="text-sm text-fg-2">
                <Link href="/login">Request a new sign-in link</Link>
            </p>
        </AuthShell>
    );
}
