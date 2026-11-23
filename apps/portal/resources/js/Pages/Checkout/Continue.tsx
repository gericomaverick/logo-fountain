import { ResendLink } from '@/Components/ResendLink';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { AuthShell } from '@/Layouts/AuthShell';
import { MISSING_SESSION_TEXT } from '@/lib/checkout';

/** K-03: continue to your account after paying. Needs the Stripe session id in the URL. */
export default function Continue() {
    const sessionId = new URLSearchParams(window.location.search).get('session_id')?.trim() ?? '';
    return (
        <AuthShell title="Continue to your account" subtitle="We’ll email a sign-in link to the address you used at checkout.">
            {sessionId ? <ResendLink sessionId={sessionId} /> : <InlineAlert tone="danger" announce>{MISSING_SESSION_TEXT}</InlineAlert>}
        </AuthShell>
    );
}
