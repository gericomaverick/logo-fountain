"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type QueueProject = {
  id: string;
  status: string;
  packageCode: string;
  clientName: string;
};

const FILTER_OPTIONS = ["ALL", "BRIEF_SUBMITTED", "IN_DESIGN", "CONCEPTS_READY"];

const NEXT_STATUS_OPTIONS: Record<string, string[]> = {
  BRIEF_SUBMITTED: ["IN_DESIGN"],
  IN_DESIGN: ["CONCEPTS_READY"],
};

export default function AdminHomePage() {
  const [filter, setFilter] = useState("ALL");
  const [projects, setProjects] = useState<QueueProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  async function loadProjects(nextFilter: string) {
    setLoading(true);
    setError(null);

    try {
      const query = nextFilter === "ALL" ? "" : `?status=${encodeURIComponent(nextFilter)}`;
      const response = await fetch(`/api/admin/projects${query}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { projects?: QueueProject[]; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to load admin queue");
      }

      setProjects(payload?.projects ?? []);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load admin queue";
      setError(message);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  async function transitionProject(projectId: string, nextStatus: string) {
    setMutatingId(projectId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/projects/${projectId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to update status");
      }

      await loadProjects(filter);
    } catch (mutateError) {
      const message = mutateError instanceof Error ? mutateError.message : "Failed to update status";
      setError(message);
    } finally {
      setMutatingId(null);
    }
  }

  useEffect(() => {
    void loadProjects(filter);
  }, [filter]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Admin Queue</h1>

        <label className="text-sm">
          <span className="mr-2 font-medium">Filter</span>
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-neutral-600">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-600">No projects in queue.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {projects.map((project) => {
            const nextStatuses = NEXT_STATUS_OPTIONS[project.status] ?? [];

            return (
              <li key={project.id} className="rounded border border-neutral-200 p-4 text-sm">
                <p><span className="font-medium">Project ID:</span> {project.id}</p>
                <p><span className="font-medium">Client:</span> {project.clientName}</p>
                <p><span className="font-medium">Package:</span> {project.packageCode}</p>
                <p><span className="font-medium">Status:</span> {project.status}</p>
                <Link className="mt-2 inline-block underline" href={`/admin/projects/${project.id}`}>
                  Open project
                </Link>

                {nextStatuses.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {nextStatuses.map((nextStatus) => (
                      <button
                        key={nextStatus}
                        type="button"
                        className="rounded border border-neutral-300 px-2 py-1"
                        disabled={mutatingId === project.id}
                        onClick={() => {
                          void transitionProject(project.id, nextStatus);
                        }}
                      >
                        Mark as {nextStatus}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-neutral-500">No allowed transition from current status.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
