import { redirect } from "next/navigation";

import { HeaderNav } from "@/components/header-nav";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { BriefForm } from "./brief-form";

type ProjectBriefPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectBriefPage({ params }: ProjectBriefPageProps) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const project = await prisma.project.findFirst({
    where: {
      id,
      client: {
        memberships: {
          some: {
            userId: user.id,
          },
        },
      },
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!project) {
    return (
      <>
        <HeaderNav />
        <main className="mx-auto max-w-3xl p-8">
          <h1 className="text-2xl font-semibold">Project brief</h1>
          <p className="mt-2 text-sm text-neutral-600">Project not found.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <HeaderNav />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Project brief</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Tell us about your brand so we can start logo concepts.
        </p>
        <p className="mt-1 text-xs text-neutral-500">Current status: {project.status}</p>

        <BriefForm projectId={project.id} />
      </main>
    </>
  );
}
