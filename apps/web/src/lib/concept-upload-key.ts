"use client";

// Persist logical request identity across response loss, navigation and retries.
// Explicit successful completion retires the key; a changed action/content gets
// a different identity. Never silently create a new identity on network failure.
export async function conceptUploadKey(projectId: string, data: FormData) {
  const file = data.get("file") as File;
  const bytes = await file.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  const identity = JSON.stringify([projectId, data.get("uploadMode") ?? "concept", data.get("conceptId"), data.get("conceptNumber"), data.get("notes"), data.get("assetNotes"), hash]);
  const storageKey = `concept-upload:${identity}`;
  const key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
  sessionStorage.setItem(storageKey, key);
  data.set("requestKey", key);
  return () => sessionStorage.removeItem(storageKey);
}
