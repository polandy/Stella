import { MonicaJsonError, readMonicaJsonExport } from './json-export';
import { readMonicaExport, type MonicaExport, type MonicaSource } from './monica-export';
import { parseSqlDump } from './sql-dump';

/*
 * Which of Monica's exports an uploaded file is, and reading it either way (docs/02 §2.16).
 * The wizard is the same for both, so the format is worked out from the file rather than
 * asked for: Monica writes JSON as one object, and `mariadb-dump` writes SQL statements —
 * a leading `{` tells them apart with nothing to configure and nothing to get wrong.
 */

/** The format a file is, decided by its first meaningful character. */
export function detectMonicaFormat(text: string): MonicaSource {
	return text.trimStart().startsWith('{') ? 'json' : 'sql';
}

/** Read either export into the one typed view the mapping works on. */
export function readMonicaFile(text: string): MonicaExport {
	if (detectMonicaFormat(text) === 'sql') return readMonicaExport(parseSqlDump(text));

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new MonicaJsonError('This file starts like JSON but could not be read as JSON.');
	}
	return readMonicaJsonExport(parsed);
}
