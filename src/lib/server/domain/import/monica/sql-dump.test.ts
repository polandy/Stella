import { describe, expect, it } from 'bun:test';
import { parseSqlDump, SqlDumpError } from './sql-dump';

/*
 * The mariadb-dump reader behind the Monica import (docs/02 §2.16, "SQL dump"). It reads
 * enough SQL to recover tables as rows keyed by column name and nothing more: CREATE TABLE
 * for the column order, INSERT … VALUES for the data. Everything else in a dump is ignored.
 */

const DUMP = `/*M!999999\\- enable the sandbox mode */
-- MariaDB dump 10.20-12.3.3-MariaDB, for debian-linux-gnu (x86_64)
DROP TABLE IF EXISTS \`contacts\`;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE \`contacts\` (
  \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
  \`first_name\` varchar(255) DEFAULT NULL,
  \`last_name\` varchar(255) DEFAULT NULL,
  \`is_dead\` tinyint(1) NOT NULL DEFAULT 0,
  \`created_at\` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`contacts_account_id_index\` (\`account_id\`),
  CONSTRAINT \`contacts_gender_id_foreign\` FOREIGN KEY (\`gender_id\`) REFERENCES \`genders\` (\`id\`)
) ENGINE=InnoDB AUTO_INCREMENT=308 DEFAULT CHARSET=utf8mb4;
LOCK TABLES \`contacts\` WRITE;
INSERT INTO \`contacts\` VALUES
(1,'Sia',NULL,0,'2023-06-14 22:24:24'),
(2,'O\\'Brien','Müller, Jr.',1,NULL),
(3,'Line one\\nline two','tab\\there',0,'2024-01-01 00:00:00');
UNLOCK TABLES;
CREATE TABLE \`tags\` (
  \`id\` int(10) unsigned NOT NULL,
  \`name\` varchar(255) NOT NULL
) ENGINE=InnoDB;
INSERT INTO \`tags\` VALUES (1,'a,b'),(2,'paren ) inside'),(3,'back\\\\slash');
CREATE TABLE \`empty\` (
  \`id\` int(10) unsigned NOT NULL
) ENGINE=InnoDB;
`;

describe('parseSqlDump', () => {
	it('recovers rows keyed by the CREATE TABLE column order', () => {
		const dump = parseSqlDump(DUMP);
		const contacts = dump.rows('contacts');
		expect(contacts).toHaveLength(3);
		expect(contacts[0]).toEqual({
			id: 1,
			first_name: 'Sia',
			last_name: null,
			is_dead: 0,
			created_at: '2023-06-14 22:24:24'
		});
	});

	it('unescapes quotes, newlines, tabs and backslashes inside strings', () => {
		const dump = parseSqlDump(DUMP);
		const [, second, third] = dump.rows('contacts');
		expect(second).toMatchObject({ first_name: "O'Brien", last_name: 'Müller, Jr.', is_dead: 1 });
		expect(third).toMatchObject({ first_name: 'Line one\nline two', last_name: 'tab\there' });
		expect(dump.rows('tags').map((t) => t.name)).toEqual(['a,b', 'paren ) inside', 'back\\slash']);
	});

	it('reads the one-line extended-insert form as well as one row per line', () => {
		expect(parseSqlDump(DUMP).rows('tags')).toHaveLength(3);
	});

	it('returns no rows for a table that has none, and refuses an unknown table', () => {
		const dump = parseSqlDump(DUMP);
		expect(dump.rows('empty')).toEqual([]);
		expect(() => dump.rows('nope')).toThrow(SqlDumpError);
		expect(dump.hasTable('empty')).toBe(true);
		expect(dump.hasTable('nope')).toBe(false);
	});

	it('refuses an INSERT whose tuple width does not match the table', () => {
		const broken = DUMP.replace("(1,'a,b'),", "(1,'a,b','extra'),");
		expect(() => parseSqlDump(broken)).toThrow(SqlDumpError);
	});

	it('refuses text that is not a MariaDB/MySQL dump at all', () => {
		expect(() => parseSqlDump('{"contacts": []}')).toThrow(SqlDumpError);
	});
});
