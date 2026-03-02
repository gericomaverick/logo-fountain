import Link from "next/link";

const filters = ["All", "SaaS", "Ecommerce", "Fintech", "Healthcare", "Agencies"];

const projects = Array.from({ length: 12 }).map((_, i) => ({
  name: `Project ${String(i + 1).padStart(2, "0")}`,
  tag: ["SaaS", "Ecommerce", "Fintech", "Healthcare"][i % 4],
}));

const learnMoreClass = "inline-flex items-center gap-2 text-sm font-semibold text-black underline underline-offset-4";

export default function WorkPage() {
  return (
    <main className="bg-white text-black">
      <div className="mx-auto w-full max-w-[1160px] px-8 py-14 md:px-12 md:py-20">
        <section className="rounded-[20px] border border-black p-7 md:p-10">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted">Our work</p>
          <h1 className="font-display mt-3 text-center text-5xl md:text-7xl">Logo gallery</h1>
          <p className="mx-auto mt-5 max-w-2xl text-center text-sm text-muted md:text-base">
            Placeholder showcase of logo case studies. Filter by industry, scan visual directions, and
            identify the style you want us to build around.
          </p>
        </section>

        <section className="mt-8 rounded-[20px] border border-black p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Filters</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                className="rounded-full border border-black px-4 py-2 text-xs font-semibold tracking-wide"
              >
                {filter}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article key={project.name} className="rounded-[20px] border border-black p-5">
              <div className="flex aspect-[4/3] items-center justify-center rounded-[16px] border border-black/80 bg-[#f6f6f6]">
                <span className="font-display text-5xl">{project.name.split(" ")[1]}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{project.name}</h2>
                <span className="rounded-full border border-black px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {project.tag}
                </span>
              </div>
              <Link href="/pricing" className={`${learnMoreClass} mt-4`}>
                Learn more <span aria-hidden>→</span>
              </Link>
            </article>
          ))}
        </section>

        <section
          className="mt-12 rounded-[20px] border border-black px-6 py-12 text-white md:px-10"
          style={{
            backgroundImage:
              "linear-gradient(120deg, rgba(0,0,0,0.88), rgba(0,0,0,0.62)), url('https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=60')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <h2 className="font-display text-4xl md:text-5xl">Want results like these?</h2>
          <p className="mt-3 max-w-2xl text-sm text-white/85 md:text-base">
            Start your project today and get your first concepts fast.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/pricing" className="rounded-full border border-white bg-white px-6 py-3 text-sm font-semibold text-black">
              Get started
            </Link>
            <Link href="/" className="rounded-full border border-white/80 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm">
              See homepage
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
