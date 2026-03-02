import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="text-sm text-neutral-600">Premium logo design — delivered via portal</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Logo Fountain</h1>
      <p className="mt-4 text-neutral-700">
        App scaffold is live. Next steps: auth, checkout + webhook fulfillment, then the brief →
        concepts → revisions → approval → ZIP delivery workflow.
      </p>

      <div className="mt-8 flex gap-3">
        <Link className="rounded-md bg-black px-4 py-2 text-white" href="/login">
          Sign in
        </Link>
        <Link className="rounded-md border px-4 py-2" href="/dashboard">
          Dashboard
        </Link>
        <Link className="rounded-md border px-4 py-2" href="/admin">
          Admin
        </Link>
      </div>
    </main>
  );
}
