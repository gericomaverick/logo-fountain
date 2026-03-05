function slugPart(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : null;
}

function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0]?.trim() ?? "";
  return local.length > 0 ? local : null;
}

type BuildFinalDeliverableFilenameArgs = {
  clientName?: string | null;
  clientEmail?: string | null;
  companyName?: string | null;
  createdAt?: Date | null;
  fallbackDate?: Date;
};

export function buildFinalDeliverableFilename({
  clientName,
  clientEmail,
  companyName,
  createdAt,
  fallbackDate = new Date(),
}: BuildFinalDeliverableFilenameArgs): string {
  const date = createdAt ?? fallbackDate;
  const yyyyMmDd = date.toISOString().slice(0, 10);

  const client = slugPart(clientName) ?? slugPart(emailLocalPart(clientEmail)) ?? "client";
  const company = slugPart(companyName) ?? "company";

  return `${client}-${company}-${yyyyMmDd}.zip`;
}
