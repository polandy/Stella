/*
 * Writes the icon SVGs into a scratch directory and prints the render plan that
 * `render.mjs` works through. Run by `generate.sh`; see there for why this is two steps.
 */

import { mkdirSync } from 'node:fs';
import { iconSvg, type IconVariant } from '../../src/lib/pwa/icon-art';

/** Every icon Stella ships, and the size each platform wants it at. */
const ICONS: readonly { variant: IconVariant; edge: number; name: string }[] = [
	{ variant: 'any', edge: 192, name: 'icon-192.png' },
	{ variant: 'any', edge: 512, name: 'icon-512.png' },
	{ variant: 'maskable', edge: 512, name: 'icon-maskable-512.png' },
	{ variant: 'any', edge: 180, name: 'apple-touch-icon-180.png' }
];

const workDir = process.env.ICON_WORK_DIR;
const outDir = process.env.ICON_OUT_DIR;
if (!workDir || !outDir) throw new Error('ICON_WORK_DIR and ICON_OUT_DIR must both be set');
mkdirSync(outDir, { recursive: true });

const plan = await Promise.all(
	ICONS.map(async ({ variant, edge, name }) => {
		const svg = `${workDir}/${name}.svg`;
		await Bun.write(svg, iconSvg(variant, edge));
		return { svg, png: `${outDir}/${name}`, edge };
	})
);

console.log(JSON.stringify(plan, null, '\t'));
