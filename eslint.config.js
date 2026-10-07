import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

// The framework's own modules. Business logic is plain TypeScript (docs/08 §8.3), so these
// may only be imported at the edges: routes, hooks and the browser adapters.
const frameworkImports = [
	{
		group: ['$app', '$app/*', '$env', '$env/*', '@sveltejs/kit', '@sveltejs/kit/*'],
		message:
			'Framework-agnostic code: SvelteKit belongs at the edges (routes/hooks), see docs/08 §8.3.'
	}
];

// `services/` wires concretes to use-cases; only the SvelteKit edge may reach for it, or a
// use-case would end up depending on a concrete DB again (docs/08 §8.3).
const servicesImports = [
	{
		regex: '^(\\$lib/server/|\\.{1,2}/(.*/)?)services(\\.[jt]s)?$',
		message: 'Only routes and hooks.server.ts wire concretes; take a `deps` argument instead.'
	}
];

// Folders CLAUDE.md calls pure, plus the domain and the access layer.
const frameworkFreeFolders = [
	'src/lib/server/domain/**',
	'src/lib/server/access/**',
	'src/lib/suggestions/**',
	'src/lib/sync/**',
	'src/lib/shell/**',
	'src/lib/contacts/**',
	'src/lib/onboarding/**',
	'src/lib/surnames/**',
	'src/lib/motion/**',
	'src/lib/menu/**',
	'src/lib/stream/**',
	'src/lib/pwa/**',
	'src/lib/commands/**',
	'src/lib/immich/**',
	'src/lib/graph/model/**',
	'src/lib/graph/layout/**',
	'src/lib/graph/keyboard.ts',
	'src/lib/graph/phone-map.ts'
];

// Files that break a boundary today. They are not refactored here: each is a later item of
// docs/concepts/architecture-review-2026-10.md, and the list shrinks as those land.
const frameworkExceptions = [
	// Type-only `SubmitFunction` imports: the enhance callbacks these modules build.
	'src/lib/sync/pending.ts',
	'src/lib/sync/pending.test.ts',
	'src/lib/surnames/held-names.svelte.ts',
	'src/lib/pwa/keepable.ts',
	// Browser adapters beside the pure policy (CLAUDE.md): they read `browser` from $app.
	'src/lib/pwa/install.svelte.ts',
	'src/lib/pwa/reachability.svelte.ts'
];
const servicesExceptions = [
	// Shared form actions living under lib/server; AR-02 moves them under routes/.
	'src/lib/server/last-names-actions.ts',
	'src/lib/server/relationships/suggestion-answers.ts'
];

// A command's refusal is already an answer; anything it throws is ours, and must reach
// `handleError` to be logged rather than turn into a form message (docs/04 §4.4).
const failLoudSyntax = [
	{
		selector:
			"CallExpression[callee.property.name='catch'][callee.object.callee.name='dispatchCommand']",
		message:
			'Do not catch dispatchCommand: refusals come back as its outcome, everything else must reach handleError (docs/08 §8.2 item 11).'
	}
];

// Edge boilerplate that has one shared home (docs/04 §4.4). A copy is a place to get the
// status, the path or the household wrong, and a wall-clock read disagrees with the `clock`.
const edgeBoilerplateSyntax = [
	{
		selector:
			"IfStatement[test.operator='!'][test.argument.object.name='locals'][test.argument.property.name='user'] > ThrowStatement.consequent > CallExpression.argument[callee.name='redirect']",
		message:
			'Use requireViewer(locals) / requireUser(locals) from $lib/server/auth/guards instead of a hand-written login redirect.'
	},
	{
		selector: "NewExpression[callee.name='Date']",
		message:
			'The edge reads time off the injected clock: todayFor(systemClock) from $lib/dates/today, or clock.now() (docs/08 §8.2 item 10).'
	},
	{
		selector:
			"FunctionDeclaration[id.name='key'], VariableDeclarator[id.name='key'][init.type=/FunctionExpression$/]",
		message: 'Use messageKey() from $lib/i18n/translate instead of a local key() helper.'
	}
];

// Server-side edge code: route modules (not components, which run in the browser too) and
// the shared form actions that still live under lib/server until AR-02 moves them.
const edgeFiles = ['src/routes/**/*.ts', ...servicesExceptions];

export default ts.config(
	{
		ignores: ['build/', '.svelte-kit/', 'data/', 'drizzle/', 'test-results/', 'playwright-report/']
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node, Bun: 'readonly' }
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { extraFileExtensions: ['.svelte'], parser: ts.parser }
		}
	},
	{
		rules: {
			// TypeScript already reports undefined names, and knows the ambient types ESLint does not.
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
			],
			// `interface Note extends NewNote {}` names a stored shape on purpose.
			'@typescript-eslint/no-empty-object-type': [
				'error',
				{ allowInterfaces: 'with-single-extends' }
			],
			// The control characters in our patterns are deliberate: separators and sanitisers.
			'no-control-regex': 'off',

			// Rules that would ask for a sweep of non-mechanical changes. Each is a decision to
			// revisit on its own, not part of wiring the tools.
			// Links are plain hrefs; `resolve()` everywhere is a migration, not a lint fix.
			'svelte/no-navigation-without-resolve': 'off',
			// svelte-check is the authority on which compiler warnings a `svelte-ignore` silences.
			'svelte/no-unused-svelte-ignore': 'off',
			// Local, non-reactive Maps/Sets/Dates inside components are common and correct here.
			'svelte/prefer-svelte-reactivity': 'off',
			// The only `{@html}` is note bodies rendered by markdown-it with `html: false`.
			'svelte/no-at-html-tags': 'off',
			// Choosing a key changes how a list re-renders; that is a per-list decision.
			'svelte/require-each-key': 'off',
			'svelte/prefer-writable-derived': 'off',
			// `{' '}` and friends keep inline spacing explicit in the markup.
			'svelte/no-useless-mustaches': 'off'
		}
	},
	{
		// Tests may catch it: they assert what it throws.
		files: ['src/**'],
		ignores: ['**/*.test.ts'],
		rules: {
			'no-restricted-syntax': ['error', ...failLoudSyntax]
		}
	},
	{
		// Flat config replaces a rule's options rather than merging them, so the edge repeats
		// the fail-loud selectors beside its own.
		files: edgeFiles,
		ignores: ['**/*.test.ts'],
		rules: {
			'no-restricted-syntax': ['error', ...failLoudSyntax, ...edgeBoilerplateSyntax]
		}
	},
	{
		files: ['**/*.svelte'],
		rules: {
			// A `$bindable` prop is written for the parent, which this rule cannot see.
			'no-useless-assignment': 'off'
		}
	},
	{
		files: ['src/**'],
		ignores: ['src/routes/**', 'src/hooks.server.ts', ...servicesExceptions],
		rules: {
			'no-restricted-imports': ['error', { patterns: servicesImports }]
		}
	},
	{
		files: frameworkFreeFolders,
		ignores: frameworkExceptions,
		rules: {
			'no-restricted-imports': ['error', { patterns: [...frameworkImports, ...servicesImports] }]
		}
	}
);
