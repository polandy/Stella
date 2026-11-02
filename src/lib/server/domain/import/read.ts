import { phrase } from '../../../i18n/phrase';
import { MonicaJsonError, readMonicaJsonExport } from './monica/json-export';
import { readMonicaExport, type SourceExport } from './monica/monica-export';
import type { ImportSource } from './source';
import { parseSqlDump } from './monica/sql-dump';
import { readVCard, VCardError } from './vcard';

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

/**
 * A contacts CSV — Google Contacts offers its own first, Outlook's opens alike: a header row of
 * comma-separated column names. A dump's first line is a comment or a statement, never that.
 */
const CSV_HEADER = /^[^,\n]*name[^,\n]*(,[^,\n]*){2,}$/i;

const looksLikeContactsCsv = (text: string): boolean =>
	CSV_HEADER.test(text.trimStart().split(/\r?\n/, 1)[0] ?? '');

/** Read any accepted export into the one typed view the mapping works on. */
export function readImportFile(text: string): SourceExport {
	switch (detectImportFormat(text)) {
		case 'sql':
			// Not read, but named: told it is no dump, the member would not know to pick vCard.
			if (looksLikeContactsCsv(text)) throw new VCardError(phrase('import.error.contactsCsv'));
			return readMonicaExport(parseSqlDump(text));
		case 'vcard':
			return readVCard(text);
		case 'json': {
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				throw new MonicaJsonError(phrase('import.error.notJson'));
			}
			return readMonicaJsonExport(parsed);
		}
	}
}
