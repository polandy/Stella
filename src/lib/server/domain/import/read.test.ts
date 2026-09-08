import { describe, expect, test } from 'bun:test';
import { detectImportFormat, readImportFile } from './read';
import { MonicaJsonError } from './monica/json-export';
import { SqlDumpError } from './monica/sql-dump';

/* Which of Monica's two exports a file is, decided from the file itself (docs/02 §2.16). */

const JSON_EXPORT = JSON.stringify({
	version: '1.0-preview.1',
	account: { uuid: 'a-1', data: [], instance: {}, properties: {} }
});

const table = (name: string) => `CREATE TABLE \`${name}\` (
  \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
  \`first_name\` varchar(255) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
`;

const SQL_DUMP =
	'-- MariaDB dump 10.20\n' +
	table('contacts') +
	"INSERT INTO `contacts` VALUES (1,'Hans');\n" +
	table('relationships') +
	table('relationship_types');


describe('detectImportFormat', () => {
	test('calls a document that opens with a brace JSON, whatever comes before it', () => {
		expect(detectImportFormat(JSON_EXPORT)).toBe('json');
		expect(detectImportFormat('\n\n  ' + JSON_EXPORT)).toBe('json');
	});

	test('calls anything else a dump, because that is what mariadb-dump writes', () => {
		expect(detectImportFormat(SQL_DUMP)).toBe('sql');
		expect(detectImportFormat('')).toBe('sql');
	});
});

describe('readImportFile', () => {
	test('reads a JSON export and says where it came from', () => {
		expect(readImportFile(JSON_EXPORT).source).toBe('json');
	});

	test('reads a dump and says where it came from', () => {
		expect(readImportFile(SQL_DUMP).source).toBe('sql');
	});

	test('refuses a file that opens like JSON but is not', () => {
		expect(() => readImportFile('{ not json at all')).toThrow(MonicaJsonError);
	});

	test('refuses a dump that is not Monica’s', () => {
		expect(() => readImportFile(table('widgets'))).toThrow(SqlDumpError);
	});
});
