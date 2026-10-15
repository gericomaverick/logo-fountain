import "server-only";
import { headers } from "next/headers";
import { sessionFromHeaders } from "./service";
export type User = { id: string; email: string; emailVerified: boolean; name?: string };
export async function getCurrentUser(): Promise<User | null> {
  return (await sessionFromHeaders(new Headers(await headers())))?.user || null;
}
