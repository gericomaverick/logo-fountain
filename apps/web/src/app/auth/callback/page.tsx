"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { postAuth, takeMailboxProof } from "@/lib/auth/client";
import { safeAuthNextPath } from "@/lib/auth/safe-next";
export default function AuthCallbackPage() {
  const router = useRouter();
  const proof = useRef<ReturnType<typeof takeMailboxProof> | null>(null);
  const [status, setStatus] = useState("Confirm sign-in to use your single-use email link.");
  const [busy, setBusy] = useState(false);
  useEffect(() => { proof.current ??= takeMailboxProof(); }, []);
  async function confirm() {
    setBusy(true);
    try {
      if (!proof.current?.token) { setStatus("This sign-in link is missing or expired. Request a fresh magic link to continue."); return; }
      const result = await postAuth("magic-link/verify", { token: proof.current.token });
      if (!result.ok) { setStatus(result.error!); return; }
      // Destination authorization remains server-enforced; never trust email/next.
      router.replace(safeAuthNextPath(proof.current.next));
      router.refresh();
    } finally { setBusy(false); }
  }
  return <AuthShell title="Complete sign-in" subtitle="Your mailbox proof expires after one hour.">
    <p className="text-base text-fg-2" role="status">{status}</p>
    <button type="button" disabled={busy} onClick={confirm} className="portal-btn-primary mt-4 w-full">Confirm sign-in</button>
    <p className="mt-4 text-sm text-fg-2"><Link className="portal-link" href="/login">Request a fresh magic link</Link></p>
  </AuthShell>;
}
