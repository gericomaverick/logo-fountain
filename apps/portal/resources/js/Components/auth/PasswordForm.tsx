import { router } from '@inertiajs/react';
import { Eye, EyeOff } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { ErrorSummary } from '@/Components/ui/ErrorSummary';
import { Field } from '@/Components/ui/Field';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Input } from '@/Components/ui/Input';
import { Button } from '@/Components/ui/Button';
import { Link } from '@/Components/ui/Link';
import { hasErrors, PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, postAuth, takeMailboxProof, validatePasswordReset, type Errors } from '@/lib/auth';

/**
 * Set password and reset password are one form against `reset-password` (story 4.9b notes): the rules up front,
 * password + confirm, show/hide. The token comes from the fragment and is removed from the URL on mount.
 */
export function PasswordForm() {
    const proof = useRef<{ token: string } | null>(null);
    proof.current ??= takeMailboxProof();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [errors, setErrors] = useState<Errors<'password' | 'confirm'>>({});
    const [failure, setFailure] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);


    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFailure(null);
        const found = validatePasswordReset(password, confirm);
        setErrors(found);
        if (hasErrors(found)) return;

        setBusy(true);
        const result = await postAuth('reset-password', { token: proof.current?.token, newPassword: password });
        setBusy(false);
        if (result.error) {
            setFailure(`We couldn’t update your password. ${result.error}`);
            return;
        }
        router.visit('/login?password=updated', { replace: true });
    }

    const summary = [
        ...(errors.password ? [{ fieldId: 'new-password', message: errors.password }] : []),
        ...(errors.confirm ? [{ fieldId: 'confirm-password', message: errors.confirm }] : []),
    ];
    const type = show ? 'text' : 'password';

    return (
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            <ErrorSummary errors={summary} />
            <p className="text-sm text-fg-2">
                Use {PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_BYTES} characters. Avoid reusing an old password.
            </p>
            <Field id="new-password" label="New password" error={errors.password}>
                <Input type={type} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field id="confirm-password" label="Confirm new password" error={errors.confirm}>
                <Input type={type} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <Button variant="ghost" size="sm" onClick={() => setShow(!show)} aria-pressed={show} icon={show ? <EyeOff size={16} /> : <Eye size={16} />}>
                {show ? 'Hide passwords' : 'Show passwords'}
            </Button>
            {failure ? (
                <InlineAlert tone="danger" announce>
                    {failure}
                </InlineAlert>
            ) : null}
            <Button type="submit" variant="primary" width="full" loading={busy} loadingLabel="Saving…">
                Save password
            </Button>
            <p className="text-sm text-fg-2">
                <Link href="/login">Back to sign in</Link>
            </p>
        </form>
    );
}
