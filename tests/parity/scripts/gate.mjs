// Turns a gate expression into a Playwright --grep regex.
//   "@auth&@api"        -> tests tagged with BOTH @auth and @api
//   "@auth&@api|@smoke" -> (@auth AND @api) OR @smoke
// Tags match whole words, so @auth doesn't match @authz.
export function gateToRegex(expression) {
  const alternatives = expression.split("|").map((part) => part.trim()).filter(Boolean);
  if (alternatives.length === 0) throw new Error("Empty gate expression");
  const body = alternatives
    .map((alt) => {
      const tags = alt.split("&").map((t) => t.trim()).filter(Boolean);
      for (const tag of tags) if (!/^@[a-z][a-z0-9-]*$/.test(tag)) throw new Error(`Invalid tag "${tag}" in gate "${expression}"`);
      return tags.map((tag) => `(?=.*${tag}(?![a-z0-9-]))`).join("") + ".*";
    })
    .join("|");
  return `^(?:${body})`;
}
