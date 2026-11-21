import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let repo: string;
let script: string;

beforeEach(() => {
	repo = mkdtempSync(join(tmpdir(), 'stella-spec-coverage-'));
	mkdirSync(join(repo, 'scripts'));
	mkdirSync(join(repo, 'e2e'));
	mkdirSync(join(repo, 'docs/dev/features'), { recursive: true });
	script = join(repo, 'scripts/spec-coverage.sh');
	copyFileSync(join(import.meta.dir, '../scripts/spec-coverage.sh'), script);
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

function report(...args: string[]) {
	return Bun.spawnSync(['bash', script, ...args], {
		cwd: tmpdir(),
		env: { ...process.env, LC_ALL: 'C' }
	});
}

test('reports exact uncited headings in numeric order without failing on gaps', () => {
	writeFileSync(
		join(repo, 'e2e/example.spec.ts'),
		[
			"import { test } from '@playwright/test';",
			'/* docs/dev/02',
			' * §2.1 (docs/dev/05 §5.9)',
			...Array<string>(21).fill(' * More context.'),
			' * (§2.1.1), §2.10.9–10 and §2.10.2–',
			' * §2.10.4.',
			' */',
			"test('does not cite §2.13 in the header', () => {});",
			'/* Neither does a second block citing §2.10.5. */'
		].join('\n')
	);
	writeFileSync(
		join(repo, 'docs/dev/features/example.md'),
		[
			'## 2.13 Only in code',
			'## 2.1 Cited parent',
			'### 2.1.1 Cited child',
			'### 2.1.2 Unit-tested <!-- coverage: unit -->',
			'#### 2.1.2.1 Not marked',
			'### 2.1.3 Not numbered in the header',
			'### Unnumbered heading',
			'## 2.2 Another feature **[M1]**',
			'## 2.10 Uncited parent',
			'### 2.10.2 Range start',
			'### 2.10.3 Range middle',
			'### 2.10.4 Range end',
			'### 2.10.5 In another block only',
			'### 2.10.9 Short range start',
			'### 2.10.10 Short range end',
			'### 2.10.11 Outside the range'
		].join('\n')
	);

	const result = report();
	expect(result.stderr.toString()).toBe('');
	expect(result.exitCode).toBe(0);
	expect(result.stdout.toString()).toBe(
		[
			'2.1.2.1 Not marked',
			'2.1.3 Not numbered in the header',
			'2.2 Another feature **[M1]**',
			'2.10 Uncited parent',
			'2.10.5 In another block only',
			'2.10.11 Outside the range',
			'2.13 Only in code',
			''
		].join('\n')
	);
});

test('reports all headings when there are no specs', () => {
	writeFileSync(join(repo, 'docs/dev/features/example.md'), '## 2.1 A feature\n');
	const result = report();
	expect(result.exitCode).toBe(0);
	expect(result.stdout.toString()).toBe('2.1 A feature\n');
});

test('fails on a usage error or a missing input directory', () => {
	const usage = report('--unknown');
	expect(usage.exitCode).not.toBe(0);
	expect(usage.stderr.toString()).toContain('usage:');

	rmSync(join(repo, 'e2e'), { recursive: true });
	const missing = report();
	expect(missing.exitCode).not.toBe(0);
	expect(missing.stderr.toString()).toContain('e2e');
});
