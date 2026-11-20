// Sets <html data-theme> before first paint from the person's choice ("system", "light" or
// "dark", kept in localStorage "lf-theme", the same key as apps/web), so a page never flashes
// the wrong theme (NFR-A4, UX §8.1). A file rather than inline so a strict CSP can allow it
// by 'self'. Keep in sync with resources/js/lib/theme.ts.
(function () {
    var root = document.documentElement;
    var pref = 'system';
    try {
        var saved = localStorage.getItem('lf-theme');
        if (saved === 'light' || saved === 'dark' || saved === 'system') pref = saved;
    } catch (e) {}
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.themePref = pref;
})();
