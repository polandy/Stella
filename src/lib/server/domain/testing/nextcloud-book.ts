import type { KnownLabel } from '../../../import-match/card';
import { createFakeAddressBook, type FakeAddressBook } from '../../nextcloud/fake-gateway';
import { fixedClock } from './clock';
import { sequentialIds } from './ids';
import { syncNextcloud, type NextcloudSyncDeps } from '../nextcloud/sync';
import { BOOK, person, SYSTEM, testHousehold } from './nextcloud-household';

/* A book in memory beside a household in memory, for the sync's and the conflicts' tests. */

export const WORDS: Record<KnownLabel, string> = { home: 'Home', work: 'Work', mobile: 'Mobile' };
export const wording = {
	fieldLabel: (label: KnownLabel) => WORDS[label],
	knownLabel: (text: string) =>
		(Object.keys(WORDS) as KnownLabel[]).find((k) => WORDS[k] === text) ?? null
};

export const vcf = (uid: string, ...lines: string[]) =>
	['BEGIN:VCARD', 'VERSION:3.0', `UID:${uid}`, ...lines, 'END:VCARD', ''].join('\r\n');

export const anna = (...more: string[]) =>
	vcf('anna', 'FN:Anna Muster', 'N:Muster;Anna;;;', 'TEL;TYPE=CELL:+41 79 111 22 33', ...more);

// prettier-ignore
export const JPEG = new Uint8Array([
	0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x40, 0x03, 0x00, 0x00, 0x00
]);
export const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export function setup(initial: Record<string, string> = { 'anna.vcf': anna() }) {
	const house = testHousehold();
	const book = createFakeAddressBook(initial);
	const deps: NextcloudSyncDeps = {
		book,
		store: house.store,
		sources: house.sources,
		writer: house.writer,
		media: house.media,
		setAvatar: house.setAvatar,
		clock: fixedClock(1_000),
		ids: sequentialIds()
	};
	const sync = () => syncNextcloud(deps, { system: SYSTEM, source: BOOK, wording, locale: 'en' });
	return { house, book, sync };
}

/** Anna in Stella, linked to her card after a first sync, in step with it. */
export async function linkedAnna(over: Parameters<typeof person>[1] = {}) {
	const world = setup();
	await world.sync();
	world.house.add(
		person('p-anna', {
			firstName: 'Anna',
			lastName: 'Muster',
			displayName: 'Anna Muster',
			fields: [{ kind: 'phone', value: '+41 79 111 22 33', label: 'Mobile' }],
			...over
		})
	);
	world.house.links.set('anna', 'p-anna');
	await world.sync();
	return world;
}

export const cardOf = (book: FakeAddressBook, uid: string) =>
	book.cards().find((c) => c.vcard.includes(`UID:${uid}\r\n`))!.vcard;
