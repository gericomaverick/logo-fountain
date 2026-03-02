import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { isAdminUser } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401, undefined, "UNAUTHORIZED");
  }

  if (!(await isAdminUser(user))) {
    return jsonError("Forbidden", 403, undefined, "FORBIDDEN");
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim() ?? "";

  const projects = await prisma.project.findMany({
    where: status ? { status } : undefined,
    select: {
      id: true,
      status: true,
      packageCode: true,
      createdAt: true,
      client: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    projects: projects.map((project) => ({
      id: project.id,
      status: project.status,
      packageCode: project.packageCode,
      clientName: project.client.name,
    })),
  });
}
