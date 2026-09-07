const nav = document.getElementById('nav');
if (nav) {
  const setScrolled = () => nav.classList.toggle('scrolled', window.scrollY > 10);
  setScrolled();
  window.addEventListener('scroll', setScrolled, { passive: true });
}
