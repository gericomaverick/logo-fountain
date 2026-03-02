"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type ConceptItem = {
  id: string;
  number: number;
  status: string;
  notes: string | null;
  imageUrl: string | null;
};

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [concepts, setConcepts] = useState<ConceptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    async function run() {
      try {
        const response = await fetch(`/api/projects/${projectId}/concepts`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { concepts?: ConceptItem[]; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load concepts");
        }

        if (!cancelled) {
          setConcepts(payload?.concepts ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load concepts");
          setConcepts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Project concepts</h1>
      <p className="mt-2 text-sm text-neutral-600">Project {projectId}</p>

      {loading ? <p className="mt-4 text-sm text-neutral-600">Loading…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && concepts.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-600">No published concepts yet.</p>
      ) : null}

      {!loading && !error && concepts.length > 0 ? (
        <ul className="mt-6 space-y-6">
          {concepts.map((concept) => (
            <li key={concept.id} className="rounded border border-neutral-200 p-4">
              <p className="text-sm font-medium">Concept #{concept.number}</p>
              {concept.notes ? <p className="mt-1 text-sm text-neutral-700">{concept.notes}</p> : null}
              {concept.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="mt-3 w-full rounded border border-neutral-200" src={concept.imageUrl} alt={`Concept ${concept.number}`} />
              ) : (
                <p className="mt-3 text-sm text-neutral-500">No image available.</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
