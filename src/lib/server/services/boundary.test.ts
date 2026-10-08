import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

/*
 * AR-01's guardrail (docs/concepts/architecture-review-2026-10.md §6): the composition root is
 * handed to the edge as `locals.services`, not pulled from a registry. The `eslint` rule in
 * `eslint.config.js` says the same for imports; this one runs under `bun test` and also pins
 * what each slice of AR-01 has already moved. Since AR-02 there is no exception left: the
 * actions several pages share live under `routes/(app)/_shared/` and take their deps as
 * arguments. A type-only import stays open — a slice's type is how a helper asks for narrow deps.
 */

const SOURCE = new Glob('src/**/*.{ts,svelte}');
const files = [...SOURCE.scanSync('.')].filter((path) => !path.endsWith('.test.ts')).sort();
const source = (path: string) => readFileSync(path, 'utf8');

const INSIDE_SERVICES = 'src/lib/server/services/';

/** Every module specifier a file imports by value: `import type` and `export type` don't count. */
const STATIC_IMPORT = /\b(?:import|export)\s+(type\s+)?(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;

function valueImports(code: string): string[] {
	const specifiers = [...code.matchAll(STATIC_IMPORT)]
		.filter(([, typeOnly]) => !typeOnly)
		.map(([, , specifier]) => specifier!);
	return [...specifiers, ...[...code.matchAll(DYNAMIC_IMPORT)].map(([, specifier]) => specifier!)];
}

/**
 * Where a specifier lands, as a path from the repo root — so `../services/app-services`, which
 * no pattern over the text alone can tell from any other folder called `services`, is caught
 * for what it is.
 */
function target(importer: string, specifier: string): string | null {
	if (specifier.startsWith('$lib/')) return `src/lib/${specifier.slice('$lib/'.length)}`;
	if (!specifier.startsWith('.')) return null;
	return posix.join(posix.dirname(importer), specifier);
}

/** Whether `code`, living at `importer`, takes anything of the composition root by value. */
const importsServices = (importer: string, code: string) =>
	valueImports(code).some((specifier) => {
		const path = target(importer, specifier)?.replace(/\.[jt]s$/, '');
		return path === INSIDE_SERVICES.slice(0, -1) || !!path?.startsWith(INSIDE_SERVICES);
	});

const isEdge = (path: string) => path.startsWith('src/routes/') || path === 'src/hooks.server.ts';

describe('the composition root', () => {
	it('is imported by value only by the edge — routes and hooks.server.ts', () => {
		const importers = files.filter(
			(path) => !path.startsWith(INSIDE_SERVICES) && importsServices(path, source(path))
		);
		expect(importers.filter((path) => !isEdge(path))).toEqual([]);
	});

	it('catches the root however it is spelled, and lets a type-only import through', () => {
		const at = 'src/lib/server/commands/handlers.ts';
		const flagged = [
			"import { getServices } from '$lib/server/services';",
			"import { getServices } from '$lib/server/services/index.ts';",
			"import { createServices } from '$lib/server/services/app-services';",
			"import { createServices } from '../services/app-services';",
			"import { createServices } from '../services';",
			"import {\n\tcreateServices\n} from '../services/app-services';",
			"const { getServices } = await import('../services/index');"
		];
		const allowed = [
			"import type { AppServices } from '../services/app-services';",
			"import type {\n\tPeopleServices\n} from '$lib/server/services/people';",
			"import { services } from './services';",
			"import { getContact } from '../domain/contacts/contacts';"
		];
		expect(flagged.filter((code) => !importsServices(at, code))).toEqual([]);
		expect(allowed.filter((code) => importsServices(at, code))).toEqual([]);
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
			'TagDeps',
			// The household context (AR-01, ninth slice): read `locals.services.household`.
			'Members',
			'MemberDeps',
			'Search',
			'SearchDeps',
			'Attention',
			// The archive context (AR-01, tenth slice): read `locals.services.archive`.
			'ArchiveDeps',
			'ImportArchiveDeps',
			'ImportDeps',
			// The immich context (AR-01, eleventh slice): read `locals.services.immich`.
			'Immich',
			'ImmichLinks',
			'ImmichIgnores',
			'ImmichNameIgnores',
			'ImmichGlimpseDeps',
			'ImmichMediaDeps',
			'ImmichMatchingDeps',
			'ImmichNameIgnoreDeps',
			'AddFromImmichDeps',
			'ImmichIgnoreDeps',
			'UseImmichPhotoDeps',
			'ImmichLinkDeps',
			// The release context (AR-01, twelfth slice): read `locals.services.release`.
			'UpdateCheck',
			// The offline context (AR-01, last slice): read `locals.services.offline` instead.
			'CommandDeps'
		];
		const retired = new RegExp(`\\bget(?:${factories.join('|')})\\b`);
		expect(files.filter((path) => retired.test(source(path)))).toEqual([]);
	});
});
