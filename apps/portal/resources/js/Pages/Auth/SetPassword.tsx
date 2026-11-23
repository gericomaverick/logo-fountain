import { PasswordForm } from '@/Components/auth/PasswordForm';
import { AuthShell } from '@/Layouts/AuthShell';

export default function SetPassword() {
    return (
        <AuthShell title="Set your password" subtitle="Use your single-use email link to set up your account, then sign in.">
            <PasswordForm />
        </AuthShell>
    );
}
