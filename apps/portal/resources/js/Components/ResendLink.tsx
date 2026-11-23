import { useState } from 'react';

import { Button } from '@/Components/ui/Button';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { sendSignInLink } from '@/lib/checkout';

/** The "send me a sign-in link" control shared by the checkout success and continue pages (5.4 AC 8). */
export function ResendLink({ sessionId }: { sessionId: string }) {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    async function send() {
        setBusy(true);
        setResult(null);
        setResult(await sendSignInLink(sessionId));
        setBusy(false);
    }

    return (
        <div className="flex flex-col gap-3">
            <Button type="button" variant="primary" width="full" loading={busy} loadingLabel="Sending…" onClick={send}>
                Email me a sign-in link
            </Button>
            {result ? (
                <InlineAlert tone={result.ok ? 'success' : 'danger'} announce>
                    {result.message}
                </InlineAlert>
            ) : null}
        </div>
    );
}
