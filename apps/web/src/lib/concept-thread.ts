type RevisionRequest = {
  id: string;
  body: string;
  createdAt: string;
  status?: string;
  user?: { email?: string | null; fullName?: string | null } | null;
};

type ConceptComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { email: string; fullName?: string | null; isAdmin?: boolean };
};

export type UnifiedThreadItem = {
  id: string;
  kind: "revision" | "comment";
  body: string;
  createdAt: string;
  authorLabel: string;
  roleLabel: "Client" | "Designer";
  status?: string;
  isDesignerReply: boolean;
};

function normalize(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toTimestamp(value: string): number {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function resolveClientLabel(user?: { email?: string | null; fullName?: string | null } | null): string {
  return normalize(user?.fullName) ?? normalize(user?.email) ?? "Client";
}

function resolveDesignerLabel(author: { email: string; fullName?: string | null }): string {
  return normalize(author.fullName) ?? normalize(author.email) ?? "Designer";
}

export function buildUnifiedConceptThread(revisionRequests: RevisionRequest[], comments: ConceptComment[]): UnifiedThreadItem[] {
  const revisionItems: UnifiedThreadItem[] = revisionRequests.map((revision) => ({
    id: `revision-${revision.id}`,
    kind: "revision",
    body: revision.body,
    createdAt: revision.createdAt,
    authorLabel: resolveClientLabel(revision.user),
    roleLabel: "Client",
    status: revision.status,
    isDesignerReply: false,
  }));

  const commentItems: UnifiedThreadItem[] = comments.map((comment) => {
    const isDesignerReply = Boolean(comment.author.isAdmin);

    return {
      id: `comment-${comment.id}`,
      kind: "comment",
      body: comment.body,
      createdAt: comment.createdAt,
      authorLabel: isDesignerReply ? resolveDesignerLabel(comment.author) : "Client",
      roleLabel: isDesignerReply ? "Designer" : "Client",
      isDesignerReply,
    };
  });

  return [...revisionItems, ...commentItems].sort(
    (a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt) || a.id.localeCompare(b.id),
  );
}
