/*
 * The two page backgrounds as literal hex (docs/05 §5.2.1).
 *
 * Everything that colours itself inside the document reads the semantic tokens from
 * `app.css`; these exist for the places outside it, where a CSS variable cannot reach —
 * the `theme-color` meta the browser paints its chrome with, and the web app manifest,
 * which is JSON. `app-colors.test.ts` holds them to the flavour blocks in `app.css`.
 */

/** A theme the interface ships, as the shell chooses between them. */
export type AppTheme = 'light' | 'dark';

/** `--bg` (Catppuccin `mantle`) in each theme — what a page is painted on. */
export const APP_BACKGROUND: Record<AppTheme, string> = {
	light: '#e6e9ef',
	dark: '#181825'
};

/**
 * What a document declares when it cannot ask which theme is showing: the manifest is read
 * once at install time, long before anyone opens the app. Light is the safer guess — a
 * light chrome around a dark page reads as a border, a dark chrome around a light page as
 * a bug.
 */
export const DEFAULT_APP_BACKGROUND = APP_BACKGROUND.light;
