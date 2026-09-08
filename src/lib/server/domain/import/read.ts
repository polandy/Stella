import { MonicaJsonError, readMonicaJsonExport } from './monica/json-export';
import { readMonicaExport, type SourceExport } from './monica/monica-export';
import type { ImportSource } from './source';
import { parseSqlDump } from './monica/sql-dump';
import { readVCard } from './vcard';

/*
 * Which accepted export an uploaded file is, and reading it whichever it is (docs/02 §2.16).
 * The wizard is the same for all three, so the format is worked out from the file rather than
 * asked for, and each says what it is in its first characters: Monica writes JSON as one
 * object, a vCard opens with BEGIN:VCARD, and `mariadb-dump` writes SQL statements.
 */

/** The format a file is, decided by its first meaningful characters. */
export function detectImportFormat(text: string): ImportSource {
	const start = text.trimStart();
	if (start.startsWith('{')) return 'json';
	if (start.slice(0, 11).toUpperCase() === 'BEGIN:VCARD') return 'vcard';
	return 'sql';
}

/** Read any accepted export into the one typed view the mapping works on. */
export function readImportFile(text: string): SourceExport {
	switch (detectImportFormat(text)) {
		case 'sql':
			return readMonicaExport(parseSqlDump(text));
		case 'vcard':
			return readVCard(text);
		case 'json': {
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				throw new MonicaJsonError('This file starts like JSON but could not be read as JSON.');
			}
			return readMonicaJsonExport(parsed);
		}
	}
}
