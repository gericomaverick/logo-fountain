export function extractBrandNameFromBriefAnswers(answers: unknown): string | null {
  if (!answers || typeof answers !== "object") return null;

  const raw = (answers as { brandName?: unknown }).brandName;
  if (typeof raw !== "string") return null;

  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

type ProjectDisplayTitleArgs = {
  projectId: string;
  brandName?: string | null;
  audience: "admin" | "client";
};

export function getProjectDisplayTitle({ projectId, brandName, audience }: ProjectDisplayTitleArgs): string {
  const shortId = projectId.slice(0, 8);
  const normalizedBrand = brandName?.trim() ?? "";

  if (normalizedBrand) {
    return audience === "admin" ? `${normalizedBrand} · #${shortId}` : normalizedBrand;
  }

  return audience === "admin" ? `Project #${shortId}` : "Your logo project";
}
