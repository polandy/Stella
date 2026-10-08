import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit';
import type { Locale } from '$lib/i18n/locales';
import type { AuthUser } from '../auth/accounts';
import type { AppServices } from '../services/app-services';

/** The member a route test is signed in as, unless it says otherwise. */
export const MEMBER: AuthUser = {
	id: 'u1',
	householdId: 'h1',
	email: 'member@stella.test',
	name: 'Member',
	role: 'member',
	locale: null,
	selfContactId: null
};

/**
 * The slices of `AppServices` a route test wires: a group holds only what the edge reads, and
 * `immich` may be null as on an instance without it.
 */
export type FakeServices = {
	[K in keyof AppServices]?: null extends AppServices[K]
		? Partial<NonNullable<AppServices[K]>> | null
		: Partial<AppServices[K]>;
};

export interface RouteEventInit {
	services: FakeServices;
	/** Who is signed in; null for nobody. */
	user?: AuthUser | null;
	locale?: Locale;
	params?: Record<string, string>;
	/** The address, absolute or from the root. */
	url?: string;
	/** Posted as the request's body; without it the request is a GET. */
	form?: FormData;
}

const ORIGIN = 'http://stella.test';

/** A group, or the graph itself, that throws on a member the test did not wire. */
function wiredOnly<T extends object>(given: T, path: string): T {
	return new Proxy(given, {
		get: (target, key) => {
			if (typeof key === 'symbol' || key in target) return Reflect.get(target, key);
			throw new Error(`${path}.${key} was not expected in this test`);
		}
	});
}

/**
 * The event SvelteKit hands a load or an action, with only what Stella's edges read: the
 * request, the address, the params and `locals`. The caller names the event type it needs
 * (`Parameters<typeof actions.x>[0]`), which is inferred where the event is passed straight in.
 */
export function routeEvent<E>(init: RouteEventInit): E {
	const url = new URL(init.url ?? '/', ORIGIN);
	const groups = Object.fromEntries(
		Object.entries(init.services).map(([name, group]) => [
			name,
			group === null ? null : wiredOnly(group, `locals.services.${name}`)
		])
	);
	const locals: App.Locals = {
		user: init.user === undefined ? MEMBER : init.user,
		locale: init.locale ?? 'en',
		requestId: 'test-request',
		services: wiredOnly(groups, 'locals.services') as unknown as AppServices
	};
	const request = new Request(url, init.form ? { method: 'POST', body: init.form } : undefined);
	return { request, url, params: init.params ?? {}, locals } as unknown as E;
}

/** A form as a browser posts it: a list repeats its field, in order. */
export function formOf(
	fields: Record<string, string | File | readonly (string | File)[]>
): FormData {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) {
		for (const one of typeof value === 'string' || value instanceof File ? [value] : value)
			form.append(name, one);
	}
	return form;
}

/** What an edge answered: what it returned, a `fail`, or what it threw for SvelteKit to send. */
export type EdgeAnswer =
	| { kind: 'data'; data: unknown }
	| { kind: 'fail'; status: number; data: unknown }
	| { kind: 'redirect'; status: number; location: string }
	| { kind: 'error'; status: number; message: string };

/**
 * The answer of a load or an action, called and handed in as it is (SvelteKit types it as a value
 * or a promise); anything else it throws is the edge's crash, and passes.
 */
export async function answerOf(run: unknown): Promise<EdgeAnswer> {
	try {
		const data = await run;
		if (isActionFailure(data)) return { kind: 'fail', status: data.status, data: data.data };
		return { kind: 'data', data };
	} catch (thrown) {
		if (isRedirect(thrown))
			return { kind: 'redirect', status: thrown.status, location: thrown.location };
		if (isHttpError(thrown))
			return { kind: 'error', status: thrown.status, message: thrown.body.message };
		throw thrown;
	}
}
