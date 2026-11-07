/*
 * Calls `onChange` whenever the page's theme changes — the app's own switch on the root's
 * `data-theme`, or the system's colour scheme — and hands back the way to stop listening.
 *
 * The export reads the light palette by flipping the theme and straight back in one task; a
 * batch that ends where it began changed nothing on screen, so it is not reported.
 */
export function watchTheme(onChange: () => void): () => void {
	const root = document.documentElement;
	const observer = new MutationObserver((records) => {
		if (records[0]?.oldValue !== root.getAttribute('data-theme')) onChange();
	});
	observer.observe(root, {
		attributes: true,
		attributeOldValue: true,
		attributeFilter: ['data-theme']
	});
	const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
	colorScheme.addEventListener('change', onChange);
	return () => {
		observer.disconnect();
		colorScheme.removeEventListener('change', onChange);
	};
}
