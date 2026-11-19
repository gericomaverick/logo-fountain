// The fake hosted Checkout page. Plain HTML form, no scripts.
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (cents, currency) => `${(cents / 100).toFixed(2)} ${String(currency).toUpperCase()}`;

export function renderHostedPage(session, items) {
  const open = session.status === "open";
  const rows = items.map((li) => `<li>${esc(li.description)} x ${li.quantity}: ${money(li.amount_total, li.currency)}</li>`).join("");
  const cancel = session.cancel_url ? `<p><a href="${esc(session.cancel_url)}" data-testid="stripe-fake-cancel">Cancel and go back</a></p>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>stripe-fake checkout</title>
<style>body{font:16px system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem}label{display:block;margin:.5rem 0}input{width:100%;padding:.4rem}button{margin:1rem .5rem 0 0;padding:.6rem 1.2rem}</style>
</head><body>
<h1>stripe-fake checkout</h1>
<p>Test-only fake of Stripe Checkout. Session <code>${esc(session.id)}</code>, status <strong data-testid="stripe-fake-status">${esc(session.status)} / ${esc(session.payment_status)}</strong>.</p>
<ul>${rows}</ul>
<p>Total: <strong>${money(session.amount_total, session.currency)}</strong></p>
${open ? `<form method="post" action="/pay/${esc(session.id)}/complete">
  <label>Email <input name="email" type="email" value="${esc(session.customer_email ?? "buyer@example.test")}" required></label>
  <label>First name <input name="first_name" value="Parity" required></label>
  <label>Last name <input name="last_name" value="Buyer" required></label>
  <button type="submit" name="outcome" value="pay">Pay</button>
  <button type="submit" name="outcome" value="fail">Fail</button>
</form>` : "<p>This session is no longer open.</p>"}
${cancel}
</body></html>`;
}
