import { router } from '@inertiajs/react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/Components/ui/Button';
import { ErrorSummary } from '@/Components/ui/ErrorSummary';
import { Field } from '@/Components/ui/Field';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Input } from '@/Components/ui/Input';
import { Link } from '@/Components/ui/Link';
import { hasErrors, postAuth, validateEmail, validateLogin, type Errors } from '@/lib/auth';
import { AuthShell } from '@/Layouts/AuthShell';

type Props = { next: string; passwordUpdated: boolean };
type Status = { tone: 'success' | 'danger'; text: string };

/** `next` arrives already through SafeNext (the route) and the `password=updated` note from the query string. */
export default function Login({ next, passwordUpdated }: Props) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<Errors<'email' | 'password'>>({});
    const [status, setStatus] = useState<Status | null>(
        passwordUpdated ? { tone: 'success', text: 'Password updated. Sign in with your new password.' } : null,
    );
    const [busy, setBusy] = useState(false);

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setStatus(null);
        const found = validateLogin(email, password);
        setErrors(found);
        if (hasErrors(found)) return;

        setBusy(true);
        const result = await postAuth('login', { email, password });
        if (result.error) {
            setBusy(false);
            setStatus({ tone: 'danger', text: `We couldn’t sign you in. ${result.error}` });
            return;
        }
        router.visit(next);
    }

    async function emailLink() {
        setStatus(null);
        const found = validateEmail(email);
        setErrors(found ? { email: found } : {});
        if (found) return;

        setBusy(true);
        const result = await postAuth('magic-link', { email, next });
        setBusy(false);
        setStatus(
            result.error
                ? { tone: 'danger', text: `We couldn’t send the sign-in link. ${result.error}` }
                : { tone: 'success', text: 'If that account exists, a sign-in link has been sent. Check your inbox.' },
        );
    }

    const summary = [
        ...(errors.email ? [{ fieldId: 'login-email', message: errors.email }] : []),
        ...(errors.password ? [{ fieldId: 'login-password', message: errors.password }] : []),
    ];

    return (
        <AuthShell title="Sign in" subtitle="Sign in with your password, or ask for a sign-in link.">
            <form className="flex flex-col gap-4" onSubmit={signIn} noValidate>
                <ErrorSummary errors={summary} />
                <Field id="login-email" label="Email" error={errors.email}>
                    <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field id="login-password" label="Password" error={errors.password}>
                    <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Button type="submit" variant="primary" width="full" loading={busy} loadingLabel="Signing in…">
                    Sign in
                </Button>
            </form>
            <Button variant="secondary" width="full" onClick={emailLink} disabledReason={busy ? 'Please wait for the current request.' : null}>
                Email me a sign-in link
            </Button>
            {status ? (
                <InlineAlert tone={status.tone} announce>
                    {status.text}
                </InlineAlert>
            ) : null}
            <p className="text-sm text-fg-2">
                <Link href="/forgot-password">Forgot password?</Link>
            </p>
        </AuthShell>
    );
}
