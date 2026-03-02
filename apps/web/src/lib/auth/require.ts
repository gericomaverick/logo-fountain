import type { User } from "@supabase/supabase-js";

import { jsonError } from "@/lib/api-error";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class RouteAuthError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = "RouteAuthError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toRouteErrorResponse(error: unknown): Response {
  if (error instanceof RouteAuthError) {
    return jsonError(error.message, error.status, error.details, error.code);
  }

  throw error;
}

export async function requireUser(): Promise<User> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new RouteAuthError("Unauthorized", 401, "UNAUTHORIZED", {
      nextStep: "Sign in and retry.",
    });
  }

  return user;
}

export async function requireAdmin(user: User): Promise<void> {
  if (!(await isAdminUser(user))) {
    throw new RouteAuthError("Forbidden", 403, "FORBIDDEN", {
      nextStep: "Use an admin account.",
    });
  }
}

export async function requireProjectMembership(userId: string, projectId: string): Promise<{ id: string; clientId: string }> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      client: { memberships: { some: { userId } } },
    },
    select: { id: true, clientId: true },
  });

  if (!project) {
    throw new RouteAuthError("Project not found", 404, "PROJECT_NOT_FOUND", {
      nextStep: "Check the project link.",
    });
  }

  return project;
}

export async function requireClientMembership(userId: string, clientId: string): Promise<{ id: string }> {
  const membership = await prisma.clientMembership.findFirst({
    where: { userId, clientId },
    select: { id: true },
  });

  if (!membership) {
    throw new RouteAuthError("Forbidden", 403, "FORBIDDEN", {
      nextStep: "Use an account linked to this client.",
    });
  }

  return membership;
}
