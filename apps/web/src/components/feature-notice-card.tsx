import { ReactNode } from "react";

type FeatureNoticeCardVariant = "brand" | "success" | "info";

type FeatureNoticeCardProps = {
  variant?: FeatureNoticeCardVariant;
  kicker?: string;
  title: string;
  body?: ReactNode;
  signature?: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
};

// A notice in the palette: a wash of its colour, a rule down the left in it,
// and ink for the words. Brand is the primary colour, for good news.
const VARIANT_STYLE: Record<FeatureNoticeCardVariant, { tone: string; kicker: string }> = {
  brand: { tone: "var(--accent)", kicker: "text-accent" },
  success: { tone: "var(--success)", kicker: "text-success" },
  info: { tone: "var(--fg-3)", kicker: "text-fg-3" },
};

export function FeatureNoticeCard({
  variant = "info",
  kicker,
  title,
  body,
  signature,
  actions,
  className,
  contentClassName,
}: FeatureNoticeCardProps) {
  const style = VARIANT_STYLE[variant];
  return (
    <section
      className={`relative overflow-hidden rounded-xl border p-5 ${className ?? ""}`}
      style={{
        background: `color-mix(in srgb, ${style.tone} ${variant === "info" ? 6 : 9}%, var(--panel))`,
        borderColor: `color-mix(in srgb, ${style.tone} 28%, transparent)`,
      }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: style.tone }} />
      <div className={`relative max-w-3xl pl-1 ${contentClassName ?? ""}`}>
        {kicker ? <p className={`text-xs font-semibold uppercase tracking-[0.06em] ${style.kicker}`}>{kicker}</p> : null}
        <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-fg">{title}</h2>
        {body ? <div className="mt-2 text-base text-fg-2">{body}</div> : null}
        {signature ? <p className="mt-1 text-sm font-medium text-fg-2">{signature}</p> : null}
        {actions ? <div className="mt-4 flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
