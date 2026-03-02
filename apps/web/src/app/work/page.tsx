import Link from "next/link";

const filters = ["All", "SaaS", "Ecommerce", "Fintech", "Healthcare", "Agencies"];

const projects = Array.from({ length: 12 }).map((_, i) => ({
  name: `Project ${String(i + 1).padStart(2, "0")}`,
  tag: ["SaaS", "Ecommerce", "Fintech", "Healthcare"][i % 4],
}));

export default function WorkPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Our work</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">Logo gallery</h1>
        <p className="mt-4 max-w-2xl text-sm text-neutral-300 sm:text-base">
          Placeholder showcase of logo case studies. Filter by industry, scan visual directions, and
          identify the style you want us to build around.
        </p>

        <section className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Filters</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold tracking-wide text-neutral-200 transition hover:border-cyan-300 hover:text-white"
              >
                {filter}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article key={project.name} className="rounded-2xl border border-white/15 bg-neutral-900 p-4">
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-white/10 bg-neutral-800">
                <span className="text-4xl font-black tracking-widest text-white/90">
                  {project.name.split(" ")[1]}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold">{project.name}</h2>
                <span className="rounded-full bg-cyan-300/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
                  {project.tag}
                </span>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-12 rounded-3xl border border-cyan-300/40 bg-cyan-300/10 p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Want results like these?</h2>
          <p className="mt-2 max-w-2xl text-sm text-cyan-100 sm:text-base">
            Start your project today and get your first concepts fast.
          </p>
          <Link
            href="/pricing"
            className="mt-5 inline-flex rounded-xl bg-cyan-400 px-6 py-3 text-sm font-bold text-black transition hover:bg-cyan-300"
          >
            Get started
          </Link>
        </section>
      </div>
    </main>
  );
}
