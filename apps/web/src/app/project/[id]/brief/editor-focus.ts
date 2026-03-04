export function scrollAndFocusEditor(
  editor: HTMLElement | null,
  heading: HTMLElement | null,
  scheduleFocus: (cb: () => void) => void = (cb) => cb(),
) {
  if (editor) {
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  scheduleFocus(() => {
    heading?.focus();
  });
}
