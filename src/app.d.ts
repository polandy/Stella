// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthUser } from '$lib/server/auth/accounts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The signed-in user, or null when the request is unauthenticated. */
			user: AuthUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
