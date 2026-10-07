// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Locale } from '$lib/i18n/locales';
import type { AuthUser } from '$lib/server/auth/accounts';
import type { AppServices } from '$lib/server/services/app-services';

declare global {
	namespace App {
		interface Error {
			message: string;
			/** The request's id when the error was ours, so the member can quote it (docs/04 §4.4). */
			requestId?: string;
		}
		interface Locals {
			/** The signed-in user, or null when the request is unauthenticated. */
			user: AuthUser | null;
			/** The language this request is answered in (docs/02 §2.19). */
			locale: Locale;
			/** This request's id in the log: the proxy's `X-Request-Id`, or one made up (docs/04 §4.4). */
			requestId: string;
			/** The composition root's object graph, built once per process (docs/08 §8.3). */
			services: AppServices;
		}
		// interface PageData {}
		interface PageState {
			/** The phone's composer sheet, opened without a round trip (docs/02 §2.22.1). */
			compose?: boolean;
		}
		// interface Platform {}
	}
}

export {};
