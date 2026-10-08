import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import type { Config } from '../config';
import { createDrizzleImmichIgnoreRepository } from '../db/immich-ignore-repository';
import { createDrizzleImmichLinkRepository } from '../db/immich-link-repository';
import { createDrizzleImmichNameIgnoreRepository } from '../db/immich-name-ignore-repository';
import type * as schema from '../db/schema';
import { createContact, type ContactDeps } from '../domain/contacts/contacts';
import type { PersonContextReads } from '../domain/contacts/person-context';
import type { AddFromImmichDeps } from '../domain/immich/add-from-immich';
import { createImmichConnection, type ImmichConnection } from '../domain/immich/connection';
import type { ImmichGateway } from '../domain/immich/gateway';
import type { ImmichGlimpseDeps, ImmichMediaDeps } from '../domain/immich/glimpse';
import type { ImmichIgnoreDeps } from '../domain/immich/ignores';
import type { ImmichLinkDeps } from '../domain/immich/links';
import type { ImmichMatchingDeps } from '../domain/immich/matching';
import type { ImmichNameIgnoreDeps } from '../domain/immich/name-ignores';
import { createImmichMediaSigner, type ImmichMediaSigner } from '../domain/immich/signed-media';
import type { UseImmichPhotoDeps } from '../domain/immich/use-as-photo';
import { setContactAvatar, type AvatarDeps } from '../domain/media/avatars';
import type { IdGenerator } from '../id';
import { demoImmichLibrary } from '../immich/demo-library';
import { createFakeImmichGateway } from '../immich/fake-gateway';
import { createHttpImmichGateway } from '../immich/http-gateway';

/*
 * The `immich` bounded context of the composition root (docs/08 §8.3): the household's Immich
 * (docs/02 §2.24) — how to ask it, whose it is, where links point, the signer every image URL
 * goes through, and the links, ignores and name ignores Stella keeps about it. Built once per
 * process by `createServices`; the edge reads it off `locals.services.immich`, which is null
 * when this instance has no Immich — the feature then appears nowhere (docs/04 §4.3).
 *
 * What an edge reads of Immich itself sits under its own name (`gateway`, `connection`,
 * `publicUrl`, `signer`); everything else is a use-case's `deps`, named after its type
 * (`immichLinkDeps` is an `ImmichLinkDeps`).
 */
export interface ImmichServices {
	gateway: ImmichGateway;
	/** Built once with the group, because it caches Immich's status. */
	connection: ImmichConnection;
	/** Immich's address as the browser reaches it. */
	publicUrl: string;
	/** Signs every image URL the browser gets for Immich (docs/02 §2.24.4). */
	signer: ImmichMediaSigner;
	/** The strip of a linked person's photos. */
	immichGlimpseDeps: ImmichGlimpseDeps;
	/** The signed proxy that serves every image from Immich. */
	immichMediaDeps: ImmichMediaDeps;
	/** *Find your people* — both tabs, from one reading of Immich. */
	immichMatchingDeps: ImmichMatchingDeps;
	/** Ignoring a face of *New from Immich* and taking it back. */
	immichNameIgnoreDeps: ImmichNameIgnoreDeps;
	/** Adding a person from an Immich face. */
	addFromImmichDeps: AddFromImmichDeps;
	/** Ignoring a proposal of the matching list and taking it back. */
	immichIgnoreDeps: ImmichIgnoreDeps;
	/**
	 * Keeping a photo from the Immich viewer as the person's own: the proxy's checks, then the
	 * path every new avatar takes (docs/02 §2.14).
	 */
	useImmichPhotoDeps: UseImmichPhotoDeps;
	/** Linking a contact to an Immich person. */
	immichLinkDeps: ImmichLinkDeps;
}

/** The part of the configuration the immich context reads. */
export type ImmichWiringConfig = Pick<Config, 'immich' | 'sessionSecret'>;

export interface ImmichWiring {
	config: ImmichWiringConfig;
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
	/** Whom a face is linked to, matched with or ignored for; the people context owns it. */
	contacts: ImmichLinkDeps['contacts'] &
		ImmichMediaDeps['contacts'] &
		ImmichMatchingDeps['contacts'] &
		ImmichIgnoreDeps['contacts'];
	/** How a person added from a face is added: the people context's, as by hand. */
	contactDeps: ContactDeps;
	/** Circles and relationships for the matching list's comparison step, from `people`. */
	contextReads: PersonContextReads;
	/** The media context's avatar path, which a photo kept from Immich takes. */
	avatarDeps: AvatarDeps;
}

/** The immich group, or null when this instance has no Immich configured. */
export function createImmichServices({
	config,
	db,
	clock,
	ids,
	contacts,
	contactDeps,
	contextReads,
	avatarDeps
}: ImmichWiring): ImmichServices | null {
	const { immich } = config;
	if (!immich) return null;
	// The demo server gets the in-memory stand-in, so the feature can be tried without a real
	// Immich.
	const gateway =
		immich.mode === 'demo'
			? createFakeImmichGateway(demoImmichLibrary())
			: createHttpImmichGateway({ baseUrl: immich.url, apiKey: immich.apiKey });
	// The session secret, which production refuses to start without; the signer keeps its own
	// use of it apart from any other.
	const signer = createImmichMediaSigner({ secret: config.sessionSecret, clock });
	const { publicUrl } = immich;
	const links = createDrizzleImmichLinkRepository(db);
	const ignores = createDrizzleImmichIgnoreRepository(db);
	const nameIgnores = createDrizzleImmichNameIgnoreRepository(db);
	const immichLinkDeps: ImmichLinkDeps = { links, contacts, gateway, clock, ids };

	return {
		gateway,
		connection: createImmichConnection({ gateway, clock }),
		publicUrl,
		signer,
		immichGlimpseDeps: { links, gateway, signer, publicUrl },
		immichMediaDeps: { links, contacts, gateway, signer },
		immichMatchingDeps: {
			links,
			ignores,
			nameIgnores,
			contacts,
			contextReads,
			gateway,
			signer,
			publicUrl
		},
		immichNameIgnoreDeps: { nameIgnores, clock },
		addFromImmichDeps: {
			...immichLinkDeps,
			addContact: (adder, input) =>
				createContact(contactDeps, { ...adder, defaultVisibility: 'shared' }, input)
		},
		immichIgnoreDeps: { ignores, contacts, clock },
		useImmichPhotoDeps: {
			links,
			contacts,
			signer,
			setAvatar: (uploader, contactId, upload) =>
				setContactAvatar(avatarDeps, uploader, contactId, upload)
		},
		immichLinkDeps
	};
}
