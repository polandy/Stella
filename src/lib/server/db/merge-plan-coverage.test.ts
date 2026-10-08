import { describe, expect, it } from 'bun:test';
import {
	getTableConfig,
	SQLiteColumn,
	SQLiteTable,
	sqliteTable,
	text,
	unique
} from 'drizzle-orm/sqlite-core';
import { MERGE_LEAVES_BEHIND, MERGE_PLAN, type MergeStep } from '../domain/contacts/merge-plan';
import * as schema from './schema';

/*
 * AR-06's guardrail for merging (docs/concepts/architecture-review-2026-10.md §6): every column
 * in the schema that points at a person is either moved by the merge plan or listed as left
 * behind, so a new table cannot be forgotten by a merge. Read from the Drizzle schema itself —
 * a foreign key onto `contact`, or a column named like one where SQLite could not add the key
 * (`user.self_contact_id`, `activity_log.contact_id`).
 */

type Leaves = readonly { table: string; column: string }[];

const tablesOf = (module: Record<string, unknown>): SQLiteTable[] =>
	Object.values(module).filter((value): value is SQLiteTable => value instanceof SQLiteTable);

/** `table.column` for every column of these tables that names a contact. */
function personColumns(tables: readonly SQLiteTable[]): string[] {
	const found = new Set<string>();
	for (const table of tables) {
		const config = getTableConfig(table);
		for (const key of config.foreignKeys) {
			const reference = key.reference();
			if (getTableConfig(reference.foreignTable).name !== 'contact') continue;
			for (const column of reference.columns) found.add(`${config.name}.${column.name}`);
		}
		for (const column of config.columns) {
			if (/(^|_)contact_id$/.test(column.name)) found.add(`${config.name}.${column.name}`);
		}
	}
	return [...found].sort();
}

/** The person columns neither the plan moves nor the list leaves behind. */
function forgotten(
	tables: readonly SQLiteTable[],
	plan: readonly MergeStep[],
	leaves: Leaves
): string[] {
	const handled = new Set([
		...plan.flatMap((step) => (step.kind === 'repoint' ? [`${step.table}.${step.column}`] : [])),
		...leaves.map((left) => `${left.table}.${left.column}`)
	]);
	return personColumns(tables).filter((column) => !handled.has(column));
}

/** Plan and list entries that name no column of the schema — a typo, or a table since gone. */
function unknown(
	tables: readonly SQLiteTable[],
	plan: readonly MergeStep[],
	leaves: Leaves
): string[] {
	const columns = new Set(
		tables.flatMap((table) => {
			const config = getTableConfig(table);
			return config.columns.map((column) => `${config.name}.${column.name}`);
		})
	);
	const names = new Set(tables.map((table) => getTableConfig(table).name));
	return [
		...plan.map((step) => (step.kind === 'repoint' ? `${step.table}.${step.column}` : step.table)),
		...leaves.map((left) => `${left.table}.${left.column}`)
	].filter((name) => !(name.includes('.') ? columns.has(name) : names.has(name)));
}

/** `table.column` for every column that is part of a primary key or a unique constraint. */
function keyedColumns(tables: readonly SQLiteTable[]): Set<string> {
	const keyed = new Set<string>();
	for (const table of tables) {
		const config = getTableConfig(table);
		const add = (columns: readonly { name: string }[]) => {
			for (const column of columns) keyed.add(`${config.name}.${column.name}`);
		};
		add(config.columns.filter((column) => column.primary || column.isUnique));
		for (const key of config.primaryKeys) add(key.columns);
		for (const key of config.uniqueConstraints) add(key.columns);
		for (const index of config.indexes) {
			if (!index.config.unique) continue;
			add(
				index.config.columns.filter(
					(column): column is SQLiteColumn => column instanceof SQLiteColumn
				)
			);
		}
	}
	return keyed;
}

describe('every column that points at a person', () => {
	const tables = tablesOf(schema);

	it('is moved by the merge plan or listed as left behind', () => {
		expect(forgotten(tables, MERGE_PLAN, MERGE_LEAVES_BEHIND)).toEqual([]);
	});

	it('is named in the plan as the schema spells it', () => {
		expect(unknown(tables, MERGE_PLAN, MERGE_LEAVES_BEHIND)).toEqual([]);
	});

	it('lets the survivor keep its row where a key could collide, unless a settlement clears it first', () => {
		const keyed = keyedColumns(tables);
		const settled = new Set(
			MERGE_PLAN.flatMap((step) => (step.kind === 'settle' ? [step.table] : []))
		);
		const unsafe = MERGE_PLAN.filter(
			(step) =>
				step.kind === 'repoint' &&
				step.onConflict === 'cannot-collide' &&
				keyed.has(`${step.table}.${step.column}`) &&
				!settled.has(step.table)
		);
		expect(unsafe).toEqual([]);
	});
});

describe('the guardrail itself', () => {
	const pet = sqliteTable('pet', {
		id: text('id').primaryKey(),
		ownerId: text('owner_id').references(() => schema.contact.id, { onDelete: 'cascade' })
	});
	const keyed = sqliteTable(
		'nickname_of',
		{ contactId: text('contact_id'), name: text('name') },
		(t) => [unique().on(t.contactId, t.name)]
	);

	it('reports a new table with a foreign key onto a person that the plan forgot', () => {
		expect(forgotten([...tablesOf(schema), pet], MERGE_PLAN, MERGE_LEAVES_BEHIND)).toEqual([
			'pet.owner_id'
		]);
	});

	it('accepts that table once it is left behind on purpose', () => {
		expect(
			forgotten([...tablesOf(schema), pet], MERGE_PLAN, [
				...MERGE_LEAVES_BEHIND,
				{ table: 'pet', column: 'owner_id' }
			])
		).toEqual([]);
	});

	it('reports a plan entry the schema does not have', () => {
		const typo: MergeStep = {
			kind: 'repoint',
			table: 'gifts',
			column: 'contact_id',
			onConflict: 'cannot-collide'
		};
		expect(unknown(tablesOf(schema), [typo], [])).toEqual(['gifts.contact_id']);
	});

	it('sees a person column by its name when it has no foreign key', () => {
		expect(personColumns([keyed])).toEqual(['nickname_of.contact_id']);
		expect(keyedColumns([keyed]).has('nickname_of.contact_id')).toBe(true);
	});
});
