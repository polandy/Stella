/*
 * A minimal reader for `mariadb-dump` / `mysqldump` output (docs/02 §2.16, "SQL dump").
 * It recovers each table's rows keyed by column name and nothing else: `CREATE TABLE` gives
 * the column order, `INSERT INTO … VALUES` gives the data. It is deliberately not an SQL
 * parser — a dump is a flat, regular text, and reading only what the mapping needs keeps
 * this pure, dependency-free and easy to test with a hand-written fixture.
 */

/** A cell as it appears in a dump: text, a number, or NULL. */
export type SqlValue = string | number | null;

/** One table row keyed by column name. */
export type SqlRow = Record<string, SqlValue>;

/** Thrown when the text is not a dump we can read, or a table is inconsistent. */
export class SqlDumpError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SqlDumpError';
	}
}

/** The tables recovered from a dump. */
export interface SqlDump {
	hasTable(name: string): boolean;
	/** Rows of a table in dump order; throws when the dump has no such table. */
	rows(name: string): SqlRow[];
}

const CREATE_TABLE = /^CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\) ENGINE=/gm;
const COLUMN_LINE = /^\s+`([^`]+)` /;
const INSERT_HEAD = /^INSERT INTO `([^`]+)` VALUES\s*/gm;

/** Backslash escapes mariadb-dump writes inside single-quoted strings. */
const ESCAPES: Record<string, string> = {
	'0': '\0',
	b: '\b',
	n: '\n',
	r: '\r',
	t: '\t',
	Z: '\x1a',
	"'": "'",
	'"': '"',
	'\\': '\\'
};

/**
 * Read the tuples of one INSERT statement starting at `start` (just after `VALUES`).
 * Returns the tuples and the index just past the terminating `;`.
 */
function readTuples(text: string, start: number, table: string): { tuples: SqlValue[][]; end: number } {
	const tuples: SqlValue[][] = [];
	let i = start;
	const n = text.length;
	const fail = (what: string): never => {
		throw new SqlDumpError(`Malformed INSERT for table ${table}: ${what}.`);
	};

	for (;;) {
		while (i < n && /\s/.test(text[i]!)) i++;
		if (text[i] !== '(') fail('expected "("');
		i++;
		const tuple: SqlValue[] = [];
		for (;;) {
			while (i < n && text[i] === ' ') i++;
			if (text[i] === "'") {
				i++;
				let buf = '';
				for (;;) {
					if (i >= n) fail('unterminated string');
					const c = text[i]!;
					if (c === '\\') {
						const next = text[i + 1] ?? '';
						buf += ESCAPES[next] ?? next;
						i += 2;
					} else if (c === "'") {
						i++;
						break;
					} else {
						buf += c;
						i++;
					}
				}
				tuple.push(buf);
			} else {
				let j = i;
				while (j < n && text[j] !== ',' && text[j] !== ')') j++;
				const token = text.slice(i, j).trim();
				if (token === 'NULL') tuple.push(null);
				else if (/^-?\d+(\.\d+)?$/.test(token)) tuple.push(Number(token));
				else if (token.length === 0) fail('empty value');
				else tuple.push(token);
				i = j;
			}
			if (text[i] === ',') {
				i++;
				continue;
			}
			if (text[i] === ')') {
				i++;
				break;
			}
			fail('expected "," or ")" after a value');
		}
		tuples.push(tuple);
		while (i < n && /\s/.test(text[i]!)) i++;
		if (text[i] === ',') {
			i++;
			continue;
		}
		if (text[i] === ';') return { tuples, end: i + 1 };
		fail('expected "," or ";" after a tuple');
	}
}

/** Parse dump text into tables. Throws `SqlDumpError` when it is not a readable dump. */
export function parseSqlDump(text: string): SqlDump {
	const columns = new Map<string, string[]>();
	for (const m of text.matchAll(CREATE_TABLE)) {
		const cols = m[2]!
			.split('\n')
			.map((line) => COLUMN_LINE.exec(line)?.[1])
			.filter((c): c is string => c !== undefined);
		columns.set(m[1]!, cols);
	}
	if (columns.size === 0) {
		throw new SqlDumpError('This does not look like a MariaDB/MySQL dump: no CREATE TABLE found.');
	}

	const rows = new Map<string, SqlRow[]>();
	for (const name of columns.keys()) rows.set(name, []);
	for (const m of text.matchAll(INSERT_HEAD)) {
		const table = m[1]!;
		const cols = columns.get(table);
		if (!cols) throw new SqlDumpError(`INSERT into ${table} without a CREATE TABLE for it.`);
		const { tuples } = readTuples(text, m.index! + m[0].length, table);
		const target = rows.get(table)!;
		for (const tuple of tuples) {
			if (tuple.length !== cols.length) {
				throw new SqlDumpError(
					`Table ${table} declares ${cols.length} columns but a row has ${tuple.length} values.`
				);
			}
			const row: SqlRow = {};
			cols.forEach((c, idx) => (row[c] = tuple[idx]!));
			target.push(row);
		}
	}

	return {
		hasTable: (name) => rows.has(name),
		rows(name) {
			const r = rows.get(name);
			if (!r) throw new SqlDumpError(`The dump has no table named ${name}.`);
			return r;
		}
	};
}
