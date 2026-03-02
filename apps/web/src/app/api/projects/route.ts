import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401, undefined, "UNAUTHORIZED");
  }

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

  return Response.json({ projects });
}
