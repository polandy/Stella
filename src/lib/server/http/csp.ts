import type { KitConfig } from '@sveltejs/kit';

type CspDirectives = NonNullable<NonNullable<KitConfig['csp']>['directives']>;

/*
 * The Content-Security-Policy (docs/04 §4.7). SvelteKit sends it from these directives and adds
 * a per-request nonce to `script-src` for every inline script, its own and the two in
 * `app.html`. Styles stay `unsafe-inline`: Svelte transitions, `style=` bindings and the print
 * sheet write inline styles, and a style cannot run code. Everything is Stella's own origin —
 * Immich's pictures arrive through Stella's proxy — except the images the browser makes itself.
 */
export const CSP_DIRECTIVES: CspDirectives = {
	'default-src': ['self'],
	'script-src': ['self'],
	'style-src': ['self', 'unsafe-inline'],
	// `data:` for the map's drawn badges, `blob:` for pictures being cropped, shared or exported.
	'img-src': ['self', 'data:', 'blob:'],
	'object-src': ['none'],
	'base-uri': ['self'],
	'frame-ancestors': ['none']
};

/**
 * `form-action` is known only at run time: signing out POSTs to Stella, which may redirect to
 * the identity provider's end-session endpoint, and browsers hold that redirect to the policy.
 */
export function formActionDirective(identityProvider: string | null): string {
	return identityProvider
		? `form-action 'self' ${new URL(identityProvider).origin}`
		: `form-action 'self'`;
}
