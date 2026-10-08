import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/*
 * AR-08's guardrail (docs/concepts/architecture-review-2026-10.md §6): one adapter per port. A
 * factory declared to return `A & B` is one object with two reasons to change, and every fake
 * of it has to implement both — the way `ContactRepository & NameCandidateSource &
 * NameRepository` grew. Infrastructure under `src/lib/server/` (the domain and the access layer
 * build no adapters) is parsed with the TypeScript compiler, so a signature split over lines or
 * a `Promise<A & B>` is read for what it is.
 *
 * It reads the declared return type only: a factory left to infer its type is not caught, which
 * is why adapters here state the port they implement (docs/08 §8.3).
 */

const INFRASTRUCTURE = new Glob('src/lib/server/**/*.ts');
const OUTSIDE = ['src/lib/server/domain/', 'src/lib/server/access/'];

/**
 * Adapters that still serve two ports. Each is a later cut of AR-08; the list only shrinks.
 */
const NOT_SPLIT_YET = [
	// The photo and media cut.
	'src/lib/server/db/photo-repository.ts',
	// The relationships cut, with AR-06.
	'src/lib/server/db/relationship-repository.ts',
	// The photo and media cut.
	'src/lib/server/media/file-store.ts'
];

/** The type a function hands back, looking through `Promise<…>`. */
function resolvedType(type: ts.TypeNode): ts.TypeNode {
	if (
		ts.isTypeReferenceNode(type) &&
		ts.isIdentifier(type.typeName) &&
		type.typeName.text === 'Promise' &&
		type.typeArguments?.length === 1
	) {
		return resolvedType(type.typeArguments[0]!);
	}
	return ts.isParenthesizedTypeNode(type) ? resolvedType(type.type) : type;
}

const isExported = (node: ts.Node) =>
	ts.canHaveModifiers(node) &&
	!!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** The exported functions of `code` whose declared return type is an intersection. */
function intersectionFactories(code: string): string[] {
	const file = ts.createSourceFile('adapter.ts', code, ts.ScriptTarget.Latest, true);
	const found: string[] = [];
	const check = (name: string, fn: ts.SignatureDeclaration) => {
		if (fn.type && ts.isIntersectionTypeNode(resolvedType(fn.type))) found.push(name);
	};
	for (const statement of file.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
			check(statement.name.text, statement);
		}
		if (ts.isVariableStatement(statement) && isExported(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				const init = declaration.initializer;
				if (
					ts.isIdentifier(declaration.name) &&
					init &&
					(ts.isArrowFunction(init) || ts.isFunctionExpression(init))
				) {
					check(declaration.name.text, init);
				}
			}
		}
	}
	return found;
}

const files = [...INFRASTRUCTURE.scanSync('.')]
	.filter((path) => !path.endsWith('.test.ts'))
	.filter((path) => !OUTSIDE.some((folder) => path.startsWith(folder)))
	.sort();

describe('an adapter factory', () => {
	it('implements one port: no infrastructure factory is declared to return A & B', () => {
		const offenders = files.filter(
			(path) => intersectionFactories(readFileSync(path, 'utf8')).length > 0
		);
		expect(offenders).toEqual(NOT_SPLIT_YET);
	});

	it('is read for its declared type, however it is written', () => {
		const flagged = [
			'export function createA(db: Db): A & B { return {} as never; }',
			'export function createA(\n\tdb: Db\n): A &\n\tB {\n\treturn {} as never;\n}',
			'export async function createA(db: Db): Promise<A & B> { return {} as never; }',
			'export const createA = (db: Db): (A & B) => ({}) as never;',
			'export const createA = function (db: Db): A & B { return {} as never; };'
		];
		const allowed = [
			'export function createA(db: Db): A { return {} as never; }',
			"export function createA(db: Db): Pick<A, 'x'> { return {} as never; }",
			'export function createA(deps: { a: A } & B): A { return {} as never; }',
			'function local(db: Db): A & B { return {} as never; }',
			'export interface Wiring { contacts: A & B }'
		];
		expect(flagged.filter((code) => intersectionFactories(code).length === 0)).toEqual([]);
		expect(allowed.filter((code) => intersectionFactories(code).length > 0)).toEqual([]);
	});
});
