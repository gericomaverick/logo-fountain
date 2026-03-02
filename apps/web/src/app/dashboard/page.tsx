import Link from "next/link";

import { HeaderNav } from "@/components/header-nav";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DashboardProject = {
  id: string;
  status: string;
  packageCode: string;
};

function getPrimaryCta(project: DashboardProject) {
  if (project.status === "AWAITING_BRIEF") {
    return {
      href: `/project/${project.id}/brief`,
      label: "Complete brief",
    };
  }

  return {
    href: `/project/${project.id}`,
    label: "View project",
  };
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <HeaderNav />
        <main className="mx-auto max-w-3xl p-8">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-sm text-neutral-600">
            You need to <Link className="underline" href="/login">sign in</Link> to view your projects.
          </p>
        </main>
      </>
    );
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { firstName: true },
  });

  const memberships = await prisma.clientMembership.findMany({
    where: { userId: user.id },
    include: {
      client: {
        include: {
          projects: {
            select: {
              id: true,
              status: true,
              packageCode: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  const projects = memberships.flatMap((membership) => membership.client.projects);

  return (
    <>
      <HeaderNav />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {profile?.firstName ? <p className="mt-2 text-sm text-neutral-700">Welcome, {profile.firstName}</p> : null}

        {projects.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">No projects yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {projects.map((project) => {
              const cta = getPrimaryCta(project);

              return (
                <li key={project.id} className="rounded border border-neutral-200 p-4 text-sm">
                  <p><span className="font-medium">Project ID:</span> {project.id}</p>
                  <p><span className="font-medium">Status:</span> {project.status}</p>
                  <p><span className="font-medium">Package:</span> {project.packageCode}</p>
                  <Link className="mt-2 inline-block underline" href={cta.href}>
                    {cta.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
