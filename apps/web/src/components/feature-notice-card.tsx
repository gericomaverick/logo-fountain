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

const CONTAINER_CLASSES: Record<FeatureNoticeCardVariant, string> = {
  brand: "border-violet-200/70 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-indigo-100 shadow-violet-200/40",
  success: "border-emerald-200/80 bg-gradient-to-br from-emerald-100 via-emerald-50 to-teal-100 shadow-emerald-200/35",
  info: "border-violet-200/70 bg-gradient-to-br from-violet-50 via-indigo-50 to-teal-50 shadow-violet-200/30",
};

const KICKER_CLASSES: Record<FeatureNoticeCardVariant, string> = {
  brand: "text-violet-900",
  success: "text-emerald-900",
  info: "text-violet-800",
};

const TITLE_CLASSES: Record<FeatureNoticeCardVariant, string> = {
  brand: "text-violet-950",
  success: "text-emerald-950",
  info: "text-violet-950",
};

const BODY_CLASSES: Record<FeatureNoticeCardVariant, string> = {
  brand: "text-violet-900",
  success: "text-emerald-900",
  info: "text-violet-900",
};

const GLOW_TOP_CLASSES: Record<FeatureNoticeCardVariant, string> = {
  brand: "from-violet-300/35 via-fuchsia-200/25 to-indigo-200/20",
  success: "from-emerald-300/30 via-teal-200/20 to-green-200/15",
  info: "from-violet-200/30 via-sky-200/20 to-teal-200/15",
};

const GLOW_BOTTOM_CLASSES: Record<FeatureNoticeCardVariant, string> = {
  brand: "from-indigo-200/25 via-violet-200/20 to-fuchsia-200/25",
  success: "from-teal-200/25 via-emerald-200/20 to-lime-200/25",
  info: "from-teal-200/20 via-cyan-200/15 to-violet-200/20",
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
  return (
    <section className={`relative overflow-hidden rounded-2xl border p-6 shadow-sm ${CONTAINER_CLASSES[variant]} ${className ?? ""}`}>
      <div aria-hidden className={`pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gradient-to-br blur-3xl ${GLOW_TOP_CLASSES[variant]}`} />
      <div aria-hidden className={`pointer-events-none absolute -bottom-24 left-10 h-52 w-52 rounded-full bg-gradient-to-tr blur-3xl ${GLOW_BOTTOM_CLASSES[variant]}`} />

      <div className={`relative max-w-3xl ${contentClassName ?? ""}`}>
        {kicker ? <p className={`text-xs font-semibold uppercase tracking-wide ${KICKER_CLASSES[variant]}`}>{kicker}</p> : null}
        <h2 className={`mt-2 text-2xl font-semibold ${TITLE_CLASSES[variant]}`}>{title}</h2>
        {body ? <div className={`mt-2 text-sm leading-6 ${BODY_CLASSES[variant]}`}>{body}</div> : null}
        {signature ? <p className={`mt-1 text-sm font-medium ${BODY_CLASSES[variant]}`}>{signature}</p> : null}
        {actions ? <div className="mt-4 flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
