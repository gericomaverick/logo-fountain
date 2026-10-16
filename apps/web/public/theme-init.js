// Sets <html data-theme> before first paint from the person's choice
// ("system", "light" or "dark", kept in localStorage), so a page never
// flashes the wrong theme. Loaded as a file rather than inline so a strict
// Content-Security-Policy can allow it by 'self'.
(function () {
  var root = document.documentElement;
  var pref = "system";
  try {
    var saved = localStorage.getItem("lf-theme");
    if (saved === "light" || saved === "dark" || saved === "system") pref = saved;
  } catch {}
  var dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themePref = pref;
})();
