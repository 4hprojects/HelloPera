/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders in the system theme and then snaps to the
 * user's choice — a flash of the wrong colour scheme on every navigation.
 * It has to be inline and synchronous, which is why it is a raw script.
 */
export function ThemeScript() {
  const js = `
(function () {
  try {
    var t = localStorage.getItem('hp-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`.trim();
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
