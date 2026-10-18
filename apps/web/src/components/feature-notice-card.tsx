import { ReactNode } from "react";

type FeatureNoticeCardVariant = "brand" | "success" | "info";

type FeatureNoticeCardProps = {
  variant?: FeatureNoticeCardVariant;
  title: string;
  body?: ReactNode;
  signature?: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
};

// A notice in the palette: a wash of its colour and ink for the words. It is
// secondary by design — the filled brand block is what carries a page's one
// important thing, and a notice should never compete with it.
const VARIANT_STYLE: Record<FeatureNoticeCardVariant, { tone: string }> = {
  brand: { tone: "var(--accent)" },
  success: { tone: "var(--success)" },
  info: { tone: "var(--fg-3)" },
};

export function FeatureNoticeCard({
  variant = "info",
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
      <div className={`relative max-w-3xl ${contentClassName ?? ""}`}>
        <h2 className="text-xl font-semibold tracking-tight text-fg">{title}</h2>
        {body ? <div className="mt-2 text-base text-fg-2">{body}</div> : null}
        {signature ? <p className="mt-2 text-base font-medium text-fg-2">{signature}</p> : null}
        {actions ? <div className="mt-4 flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
