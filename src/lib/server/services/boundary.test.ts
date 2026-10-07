import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';

/*
 * AR-01's guardrail (docs/concepts/architecture-review-2026-10.md §6): the composition root is
 * handed to the edge as `locals.services`, not pulled from a registry. The `eslint` rule in
 * `eslint.config.js` says the same for imports; this one runs under `bun test` and also pins
 * what each slice of AR-01 has already moved.
 */

const SOURCE = new Glob('src/**/*.{ts,svelte}');
const files = [...SOURCE.scanSync('.')].filter((path) => !path.endsWith('.test.ts')).sort();
const source = (path: string) => readFileSync(path, 'utf8');

const SERVICES_IMPORT =
	/(?:from\s+|import\s*\(\s*)['"](?:\$lib\/server\/|(?:\.\.?\/)+(?:[\w-]+\/)*)services(?:\/index)?(?:\.[jt]s)?['"]/;
const INSIDE_SERVICES = 'src/lib/server/services/';

/*
 * Shared edge code that still lives under lib/server and imports the registry. AR-02 moves it
 * under routes/; until then the list may only shrink. Empty since the relationships slice:
 * every shared edge helper now reads `locals.services`.
 */
const EDGE_HELPERS: string[] = [];

const isEdge = (path: string) =>
	path.startsWith('src/routes/') || path === 'src/hooks.server.ts' || EDGE_HELPERS.includes(path);

describe('the composition root', () => {
	it('is imported only by the edge and the listed edge helpers', () => {
		const importers = files.filter(
			(path) => !path.startsWith(INSIDE_SERVICES) && SERVICES_IMPORT.test(source(path))
		);
		expect(importers.filter((path) => !isEdge(path))).toEqual([]);
	});

	it('keeps the edge-helper allow-list to files that still need it', () => {
		const stale = EDGE_HELPERS.filter((path) => !SERVICES_IMPORT.test(source(path)));
		expect(stale).toEqual([]);
	});

	it('is built only by hooks.server.ts, which hands it on as locals.services', () => {
		const builders = files.filter(
			(path) => !path.startsWith(INSIDE_SERVICES) && /\bgetServices\b/.test(source(path))
		);
		expect(builders).toEqual(['src/hooks.server.ts']);
	});

	it('has no factory left for a context already in AppServices', () => {
		const factories = [
			// The auth context (AR-01, first slice): read `locals.services.auth` instead.
			'Accounts',
			'Sessions',
			'SessionDeps',
			'AccountDeps',
			'ApiTokenDeps',
			'ApiImportDeps',
			'OidcProvider',
			'Identities',
			'OidcPolicy',
			'AuthorizationRequestDeps',
			'RpLogoutDeps',
			'CompleteLoginDeps',
			// The people context (AR-01, second slice): read `locals.services.people` instead.
			'Contacts',
			'ContactDeps',
			'DeleteContactDeps',
			'NameDeps',
			'LastNameDeps',
			'SurnameReviewDeps',
			'SurnameDismissalDeps',
			'PersonContextDeps',
			'NamesakeContextDeps',
			'PeopleStampDeps',
			'SelfContactDeps',
			'SuggestionDeps',
			// The relationships context (AR-01, third slice): read `locals.services.relationships`.
			'Relationships',
			'RelationshipTypes',
			'RelationshipRepository',
			'RelationshipDeps',
			'RelationshipTypeDeps',
			'SuggestionDismissals',
			'SuggestionReviewDeps',
			'FamilyReadDeps',
			'GraphRepository',
			// The circles context (AR-01, fourth slice): read `locals.services.circles`.
			'CircleDeps',
			'CirclePhotoDeps',
			'CutDeps',
			// The media context (AR-01, fifth slice): read `locals.services.media`.
			'Photos',
			'MediaStore',
			'AvatarDeps',
			'ImportedPhotoDeps',
			'GalleryDeps',
			'FramingDeps',
			'GalleryUploadDeps',
			'JournalPhotoDeps',
			'StreamDeps',
			// The story context (AR-01, sixth slice): read `locals.services.story`.
			'Journal',
			'Interactions',
			'JournalDeps',
			'InteractionDeps',
			'StoryDeps',
			'CaptureMomentDeps',
			// The notes context (AR-01, seventh slice): read `locals.services.notes`.
			'Notes',
			'NoteDeps',
			'MentionedIn',
			'MentionedInDeps',
			// The records context (AR-01, eighth slice): read `locals.services.records`.
			'ContactFields',
			'ContactFieldDeps',
			'ImportantDates',
			'ImportantDateDeps',
			'Tags',
			'TagDeps'
		];
		const retired = new RegExp(`\\bget(?:${factories.join('|')})\\b`);
		expect(files.filter((path) => retired.test(source(path)))).toEqual([]);
	});
});
