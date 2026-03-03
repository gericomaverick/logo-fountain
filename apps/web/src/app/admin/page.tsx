import Link from "next/link";

import { HeaderNav } from "@/components/header-nav";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { prisma } from "@/lib/prisma";


type AdminSectionKey = "needs-action" | "in-progress" | "delivered";

const NEEDS_ACTION_STATUSES = ["BRIEF_SUBMITTED", "CONCEPTS_READY", "ON_HOLD"] as const;
const DELIVERED_STATUSES = ["DELIVERED", "CANCELLED", "REFUNDED"] as const;

function getSectionKey(status: string): AdminSectionKey {
  if (NEEDS_ACTION_STATUSES.includes(status as (typeof NEEDS_ACTION_STATUSES)[number])) return "needs-action";
  if (DELIVERED_STATUSES.includes(status as (typeof DELIVERED_STATUSES)[number])) return "delivered";
  return "in-progress";
}

function getSectionMeta(section: AdminSectionKey) {
  if (section === "needs-action") {
    return {
      title: "Needs action",
      description: "Projects that likely need admin intervention or client nudges.",
    };
  }

  if (section === "in-progress") {
    return {
      title: "In progress",
      description: "Active projects moving through design, revisions, or production.",
    };
  }

  return {
    title: "Delivered",
    description: "Completed or closed work.",
  };
}

function getStuckReason(order: { status: string; stripeCheckoutSessionId: string | null } | null): string | null {
  if (!order) return "Missing order record (webhook likely never fulfilled).";
  if (order.status === "NEEDS_CONTACT") return "Order needs contact (no purchaser email provisioned).";
  if (order.status !== "FULFILLED") return `Order status is ${order.status}.`;
  return null;
}

function AdminSection({
  title,
  description,
  projects,
}: {
  title: string;
  description: string;
  projects: Array<{
    id: string;
    status: string;
    packageCode: string;
    createdAt: Date;
    updatedAt: Date;
    client: { name: string };
    orders: Array<{ status: string; stripeCheckoutSessionId: string | null }>;
  }>;
}) {
  return (
    <section className="mt-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
        <p className="mt-1 text-sm text-neutral-600">{description}</p>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">No projects in this section.</p>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const latestOrder = project.orders[0] ?? null;
            const stuckReason = getStuckReason(latestOrder);

            return (
              <article key={project.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <ProjectStatusBadge status={project.status} />
                    <h3 className="mt-3 text-base font-semibold text-neutral-900">Project {project.id.slice(0, 8)}</h3>
                    <p className="mt-1 text-sm text-neutral-600">Client: {project.client.name}</p>
                    <p className="text-sm text-neutral-600">Package: {project.packageCode}</p>
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end">
                    <Link className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white" href={`/admin/projects/${project.id}`}>
                      Open project
                    </Link>
                    <Link className="text-sm text-neutral-700 underline" href={`/admin/projects/${project.id}/messages`}>
                      Messages
                    </Link>
                    <Link className="text-sm text-neutral-700 underline" href={`/admin/projects/${project.id}/upload`}>
                      Upload concepts
                    </Link>
                  </div>
                </div>

                {stuckReason ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {stuckReason}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default async function AdminHomePage() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      status: true,
      packageCode: true,
      createdAt: true,
      updatedAt: true,
      client: { select: { name: true } },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, stripeCheckoutSessionId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const sectioned: Record<AdminSectionKey, typeof projects> = {
    "needs-action": [],
    "in-progress": [],
    delivered: [],
  };

  for (const project of projects) {
    sectioned[getSectionKey(project.status)].push(project);
  }

  return (
    <>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold text-neutral-900">Admin dashboard</h1>
          <Link className="text-sm underline" href="/admin/health">Health checks</Link>
        </div>

        <AdminSection {...getSectionMeta("needs-action")} projects={sectioned["needs-action"]} />
        <AdminSection {...getSectionMeta("in-progress")} projects={sectioned["in-progress"]} />
        <AdminSection {...getSectionMeta("delivered")} projects={sectioned.delivered} />
      </main>
    </>
  );
}
