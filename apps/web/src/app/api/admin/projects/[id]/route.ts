import { isAdminUser } from "@/lib/auth/admin";
import { jsonError } from "@/lib/api-error";
import { getProjectSnapshot } from "@/lib/project-snapshot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401, { nextStep: "Sign in and retry." }, "UNAUTHORIZED");
  if (!(await isAdminUser(user))) return jsonError("Forbidden", 403, { nextStep: "Use an admin account." }, "FORBIDDEN");

  const { id } = await params;
  const snapshot = await getProjectSnapshot({ projectId: id });
  if (!snapshot) return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");

  return Response.json({ snapshot });
}
