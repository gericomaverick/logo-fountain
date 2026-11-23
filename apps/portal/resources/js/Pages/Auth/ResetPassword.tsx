import { PasswordForm } from '@/Components/auth/PasswordForm';
import { AuthShell } from '@/Layouts/AuthShell';

export default function ResetPassword() {
    return (
        <AuthShell title="Reset your password" subtitle="Choose a new password with your single-use email link.">
            <PasswordForm />
        </AuthShell>
    );
}
