import { expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function withFixture(
	test: (root: string, run: (...args: string[]) => Bun.SyncSubprocess<'pipe', 'pipe'>) => void
) {
	const root = mkdtempSync(join(tmpdir(), 'stella-spec-coverage-'));
	try {
		const script = join(root, 'scripts/spec-coverage.sh');
		for (const dir of ['scripts', 'e2e', 'docs/dev/features']) {
			mkdirSync(join(root, dir), { recursive: true });
		}
		copyFileSync(join(import.meta.dir, '../scripts/spec-coverage.sh'), script);
		test(root, (...args) =>
			Bun.spawnSync(['bash', script, ...args], {
				cwd: tmpdir(),
				env: { ...process.env, LC_ALL: 'C' },
				stdout: 'pipe',
				stderr: 'pipe'
			})
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

it('reports exact, unmarked heading numbers not cited in a spec’s first block', () => {
	withFixture((root, run) => {
		writeFileSync(
			join(root, 'docs/dev/features/example.md'),
			[
				'## 2.10 Uncited parent **[M1]**',
				'### 2.10.1 Only unit <!-- coverage: unit -->',
				'### 2.10.2 Also uncited',
				'### 2.10.9 Range start',
				'### 2.10.10 Range end',
				'### 2.10.11 Past range',
				'## 2.20 Cited parent',
				'## 2.2 Uncited despite 2.20',
				'#### 2.2.4.7 Deep heading cited late',
				'### Not numbered'
			].join('\n')
		);
		writeFileSync(
			join(root, 'e2e/example.spec.ts'),
			[
				"import { test } from '@playwright/test';",
				'/*',
				' * See docs/dev/02',
				' * §2.20 and (§2.10.9–10); see also docs/dev/05 §5.9.',
				...Array<string>(21).fill(' * More detail.'),
				' * See §2.2.4.7.',
				' */',
				'/** A later comment citing §2.2 and §2.10.11. */',
				'test("§2.10.2", () => {});'
			].join('\n')
		);
		const result = run();
		expect(result.stderr.toString()).toBe('');
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe(
			'2.2 Uncited despite 2.20\n2.10 Uncited parent **[M1]**\n2.10.2 Also uncited\n2.10.11 Past range\n'
		);
	});
});

it('succeeds with no findings but fails on usage or missing input', () => {
	withFixture((root, run) => {
		writeFileSync(
			join(root, 'docs/dev/features/example.md'),
			'## 2.1 Only unit <!-- coverage: unit -->\n'
		);
		const result = run();
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe('');
		expect(run('--unknown').exitCode).not.toBe(0);
		// A matched dangling link must not be mistaken for an empty set of specs.
		symlinkSync('missing', join(root, 'e2e/missing.spec.ts'));
		expect(run().exitCode).not.toBe(0);
	});
});
