import { useState, type FormEvent } from 'react';

import { Button } from '@/Components/ui/Button';
import { Field } from '@/Components/ui/Field';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Input } from '@/Components/ui/Input';
import { Link } from '@/Components/ui/Link';
import { postAuth, validateEmail } from '@/lib/auth';
import { AuthShell } from '@/Layouts/AuthShell';

const SENT = 'If that account exists, a password recovery email has been sent. Check your inbox.';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setStatus(null);
        const found = validateEmail(email);
        setError(found);
        if (found) return;

        setBusy(true);
        const result = await postAuth('forgot-password', { email });
        setBusy(false);
        // The server answers the same for any address; a failure here is the request itself failing.
        setStatus(result.ok ? { tone: 'success', text: SENT } : { tone: 'danger', text: 'We couldn’t start password recovery. Please try again later.' });
    }

    return (
        <AuthShell title="Reset your password" subtitle="We’ll email you a link to set a new password.">
            <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
                <Field label="Email" error={error}>
                    <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Button type="submit" variant="primary" width="full" loading={busy} loadingLabel="Sending…">
                    Send reset email
                </Button>
            </form>
            {status ? (
                <InlineAlert tone={status.tone} announce>
                    {status.text}
                </InlineAlert>
            ) : null}
            <p className="text-sm text-fg-2">
                <Link href="/login">Back to sign in</Link>
            </p>
        </AuthShell>
    );
}
