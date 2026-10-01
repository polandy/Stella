/*
 * The "+N" a node wears while expanding it would bring more people onto the map (docs/05
 * §5.8). The canvas draws no DOM, so the badge is a tiny SVG image the stylesheet lays over the
 * node's corner. Pure: a count and resolved colours in, a data URI out — no request, and no
 * colour of its own, so it follows the theme with the rest of the palette.
 */

/** The colours a badge is drawn in, already resolved from the semantic tokens. */
export interface BadgeColours {
	fill: string;
	text: string;
	ring: string;
}

export interface Badge {
	uri: string;
	width: number;
	height: number;
}

/** Past this the badge says "99+": the exact number matters less than that there are many. */
const MAX_SPELLED = 99;
const HEIGHT = 16;
const FONT_SIZE = 10;
/** Roughly how wide one character of the badge's digits is drawn, at its font size. */
const CHARACTER_WIDTH = 6;
const PADDING_X = 5;

export function expandBadge(count: number, colours: BadgeColours): Badge {
	const text = count > MAX_SPELLED ? `${MAX_SPELLED}+` : `+${count}`;
	const width = Math.max(HEIGHT, text.length * CHARACTER_WIDTH + 2 * PADDING_X);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}">` +
		`<rect x="0.75" y="0.75" width="${width - 1.5}" height="${HEIGHT - 1.5}" rx="${(HEIGHT - 1.5) / 2}" ` +
		`fill="${colours.fill}" stroke="${colours.ring}" stroke-width="1.5"/>` +
		`<text x="${width / 2}" y="${HEIGHT / 2}" text-anchor="middle" dominant-baseline="central" ` +
		`font-family="system-ui, sans-serif" font-size="${FONT_SIZE}" font-weight="600" fill="${colours.text}">${text}</text>` +
		`</svg>`;
	return { uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width, height: HEIGHT };
}
