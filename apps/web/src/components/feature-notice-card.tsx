import type { CSSProperties, ReactNode } from "react";

type FeatureNoticeCardVariant = "brand" | "success" | "info" | "celebration";

type FeatureNoticeCardProps = {
  variant?: FeatureNoticeCardVariant;
  title: string;
  body?: ReactNode;
  signature?: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
};

// A notice in the palette. `brand` and `info` are a wash of their colour with
// ink for the words; `success` is the filled teal block the dashboard uses to
// say nothing is owed, because a 12% wash of a colour behind a white card is a
// rumour of one — the hue was right and it still read as faded.
const VARIANT_STYLE: Record<FeatureNoticeCardVariant, { tone: string }> = {
  brand: { tone: "var(--accent)" },
  success: { tone: "var(--success-block)" },
  info: { tone: "var(--fg-3)" },
  // Rendered by `.celebration`, not by a wash of this tone.
  celebration: { tone: "var(--accent)" },
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
  const celebrating = variant === "celebration";
  const filled = variant === "success";
  return (
    <section
      className={`relative overflow-hidden rounded-xl border p-5 ${celebrating ? "celebration border-transparent" : ""} ${filled ? "border-transparent" : ""} ${className ?? ""}`}
      style={
        celebrating
          ? undefined
          : filled
            ? ({
                background: style.tone,
                // Read by .portal-btn-on-block, so a button on this block
                // takes its colours from the block it is sitting on.
                "--block-fg": "var(--success-block-fg)",
                "--block-btn-fg": "var(--success-block)",
              } as CSSProperties)
            : {
                background: `color-mix(in srgb, ${style.tone} ${variant === "info" ? 8 : 12}%, var(--panel))`,
                borderColor: `color-mix(in srgb, ${style.tone} 28%, transparent)`,
              }
      }
    >
      <div className={`relative max-w-3xl ${contentClassName ?? ""}`}>
        <h2 className={`portal-display text-xl ${celebrating ? "" : filled ? "text-[var(--success-block-fg)]" : "text-fg"}`}>{title}</h2>
        {body ? <div className={`mt-2 text-base ${celebrating ? "opacity-80" : filled ? "text-[var(--success-block-fg-2)]" : "text-fg-2"}`}>{body}</div> : null}
        {signature ? <p className={`mt-2 text-base font-medium ${celebrating ? "opacity-80" : filled ? "text-[var(--success-block-fg-2)]" : "text-fg-2"}`}>{signature}</p> : null}
        {actions ? <div className="mt-4 flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
