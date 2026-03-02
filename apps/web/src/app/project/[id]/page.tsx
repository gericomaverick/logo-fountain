type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Project</h1>
      <p className="mt-2 text-sm text-neutral-600">Project detail stub for {id}.</p>
    </main>
  );
}
