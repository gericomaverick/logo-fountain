import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProjectSnapshot } from "@/lib/project-snapshot";

import { ProjectHub, type Snapshot } from "./project-hub";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * The project's first snapshot is built here, with the page, rather than
 * fetched by the browser once the page has already painted. The query itself
 * takes about 15ms; what the person used to wait for was the round trip after
 * paint, and the page growing underneath them when it landed. The hub keeps
 * polling for what changes after that.
 */
export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Membership is the gate, exactly as the API route applies it. An admin
  // opening a customer's project is sent to the admin view, which is theirs.
  const project = await prisma.project.findFirst({
    where: { id, client: { memberships: { some: { userId: user.id } } } },
    select: { id: true },
  });

  const [snapshot, profile] = await Promise.all([
    project ? getProjectSnapshot({ projectId: project.id, userId: user.id }) : Promise.resolve(null),
    prisma.profile.findUnique({ where: { id: user.id }, select: { firstName: true } }),
  ]);

  // Put it through the same JSON the polled response goes through. The builder
  // hands back Date objects; the API turns them into strings, and the hub is
  // written for strings. Serialising here means there is one shape to reason
  // about rather than two that differ only on first paint.
  const initialSnapshot = snapshot ? (JSON.parse(JSON.stringify(snapshot)) as Snapshot) : null;

  return <ProjectHub initialSnapshot={initialSnapshot} initialFirstName={profile?.firstName ?? null} />;
}
