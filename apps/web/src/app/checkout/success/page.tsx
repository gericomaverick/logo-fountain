type CheckoutSuccessPageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const { session_id: sessionId } = await searchParams;

  return (
    <main style={{ padding: "2rem", maxWidth: 680, margin: "0 auto" }}>
      <h1>Payment received</h1>
      <p>Thanks — your order is being processed.</p>
      {sessionId ? <p>Session: {sessionId}</p> : null}
    </main>
  );
}
