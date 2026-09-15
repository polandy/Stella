/*
 * The app icon, drawn once (docs/02 §2.18).
 *
 * `static/logo.svg` cannot be used directly: it is transparent and swaps its palette with
 * `prefers-color-scheme`, while a launcher icon has to be opaque and to look the same on
 * every home screen. So the mark is re-laid here on a Mocha ground, centred on its own
 * ink rather than on its viewBox, and rasterised by `scripts/icons/generate.sh`.
 */

/** The mark's bounding box inside the 100×100 viewBox — its ink, not its canvas. */
const INK = { x: 11.5, y: 15.5, width: 79, height: 53 };

/** Mocha, so the icon reads the same against a light and a dark home screen. */
const GROUND = '#1e1e2e';
const THREAD = '#94e2d5';
const NODES = {
	mauve: '#cba6f7',
	yellow: '#f9e2af',
	blue: '#89b4fa',
	peach: '#fab387',
	pink: '#f5c2e7'
};

/**
 * How wide the mark is drawn, as a fraction of the icon's edge.
 *
 * `any` is shown as-is and only wants breathing room. `maskable` is cropped to the
 * launcher's own shape, which is guaranteed to keep only the centre 80% — so the mark is
 * drawn small enough that its *diagonal* stays inside that circle, not just its width.
 */
const MARK_WIDTH_FRACTION = { any: 0.7, maskable: 0.62 } as const;

/** Which of the two ways an icon can be treated it is drawn for. */
export type IconVariant = keyof typeof MARK_WIDTH_FRACTION;

/** The icon as an SVG document, `edge` pixels square. */
export function iconSvg(variant: IconVariant, edge: number): string {
	// Scale so the ink — not the viewBox — takes up the intended share of the icon.
	const scale = (edge * MARK_WIDTH_FRACTION[variant]) / INK.width;
	const markCentre = { x: INK.x + INK.width / 2, y: INK.y + INK.height / 2 };
	const offsetX = edge / 2 - markCentre.x * scale;
	const offsetY = edge / 2 - markCentre.y * scale;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${edge}" height="${edge}" viewBox="0 0 ${edge} ${edge}">
	<rect width="${edge}" height="${edge}" fill="${GROUND}" />
	<g transform="translate(${offsetX.toFixed(3)} ${offsetY.toFixed(3)}) scale(${scale.toFixed(5)})">
		<g fill="none" stroke="${THREAD}" stroke-width="3.6" stroke-linecap="round">
			<path d="M18,62 Q30,60 42,50" />
			<path d="M42,50 Q54,44 66,60" />
			<path d="M66,60 Q76,54 84,40" />
			<path d="M42,50 Q42,34 48,22" />
		</g>
		<circle fill="${NODES.mauve}" cx="18" cy="62" r="6.5" />
		<circle fill="${NODES.yellow}" cx="48" cy="22" r="6.5" />
		<circle fill="${NODES.blue}" cx="66" cy="60" r="6.5" />
		<circle fill="${NODES.peach}" cx="84" cy="40" r="6.5" />
		<circle fill="${NODES.pink}" cx="42" cy="50" r="8.5" />
	</g>
</svg>
`;
}

/** Half the diagonal of the drawn mark, as a fraction of the icon's edge. */
export function markReachFraction(variant: IconVariant): number {
	const scale = MARK_WIDTH_FRACTION[variant] / INK.width;
	return (Math.hypot(INK.width, INK.height) * scale) / 2;
}
