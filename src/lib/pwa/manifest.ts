/*
 * The web app manifest (docs/02 §2.18), built rather than shipped as a static file.
 *
 * Its name and description are read by the launcher and the install prompt, so they are
 * strings a person sees — which means they come from the catalogue like every other one
 * (docs/08 §8.7). Pure: the route hands it a translator and serialises what comes back.
 */

import { DEFAULT_APP_BACKGROUND } from '$lib/design/app-colors';
import type { Translate } from '$lib/i18n/translate';

/** How a launcher is allowed to treat an icon: crop it to its own shape, or leave it be. */
export type IconPurpose = 'any' | 'maskable';

/** One entry of the manifest's `icons` array. */
export interface ManifestIcon {
	src: string;
	sizes: string;
	type: string;
	purpose: IconPurpose;
}

/** The subset of the manifest spec Stella fills in. */
export interface WebAppManifest {
	name: string;
	short_name: string;
	description: string;
	id: string;
	start_url: string;
	scope: string;
	display: 'standalone';
	orientation: 'portrait-primary' | 'any';
	background_color: string;
	theme_color: string;
	icons: ManifestIcon[];
}

/** Where the generated icons are served from, under `static/`. */
const ICON_PATH = '/icons';

/**
 * What the platforms ask for: 192 and 512 for Android's launcher and splash, and a
 * maskable 512 so a launcher that crops to a circle or a squircle has padding to cut into
 * instead of eating the logo.
 */
export const APP_ICONS: readonly ManifestIcon[] = [
	{ src: `${ICON_PATH}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
	{ src: `${ICON_PATH}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
	{
		src: `${ICON_PATH}/icon-maskable-512.png`,
		sizes: '512x512',
		type: 'image/png',
		purpose: 'maskable'
	}
];

/**
 * The icon iOS uses, which reads neither the manifest nor an SVG: Safari takes only a PNG
 * from a `apple-touch-icon` link, and crops it to its own rounded square, so this one is
 * drawn full-bleed rather than padded like the maskable variant.
 */
export const APPLE_TOUCH_ICON: ManifestIcon = {
	src: `${ICON_PATH}/apple-touch-icon-180.png`,
	sizes: '180x180',
	type: 'image/png',
	purpose: 'any'
};

/** The manifest as the reader's browser should receive it. */
export function buildManifest(t: Translate): WebAppManifest {
	return {
		name: t('pwa.name'),
		short_name: t('pwa.shortName'),
		description: t('pwa.description'),
		// Pinned so the install survives a change of start_url: without an explicit id the
		// browser derives one from it and would treat the app as a different one.
		id: '/',
		start_url: '/',
		// The whole origin, or following a link to a person would leave the installed window.
		scope: '/',
		display: 'standalone',
		orientation: 'any',
		background_color: DEFAULT_APP_BACKGROUND,
		theme_color: DEFAULT_APP_BACKGROUND,
		icons: [...APP_ICONS]
	};
}
