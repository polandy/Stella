import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { join } from 'node:path';

/* Review O-04/O-05: a moved tag must not run with our token, and CI keeps the minimum rights. */
const repoRoot = join(import.meta.dir, '..');

async function workflows(): Promise<Array<{ name: string; text: string }>> {
	const files = [...new Glob('.github/workflows/*.yml').scanSync({ cwd: repoRoot })];
	return Promise.all(
		files.map(async (name) => ({ name, text: await Bun.file(join(repoRoot, name)).text() }))
	);
}

describe('the supply chain', () => {
	it('runs every third-party action from a commit SHA with a version comment', async () => {
		for (const { name, text } of await workflows()) {
			for (const [, ref] of text.matchAll(/^\s*- uses: (\S.*)$/gm)) {
				if (ref.startsWith('./')) continue;
				expect(`${name}: ${ref}`).toMatch(/@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
			}
		}
	});

	it('gives ci.yml read-only repository rights', async () => {
		const ci = await Bun.file(join(repoRoot, '.github/workflows/ci.yml')).text();
		expect(ci).toMatch(/^permissions:\n {2}contents: read\n/m);
	});

	it('builds the image on a base pinned by digest', async () => {
		const dockerfile = await Bun.file(join(repoRoot, 'Dockerfile')).text();
		expect(dockerfile).toMatch(/^ARG BUN_DIGEST=sha256:[0-9a-f]{64}$/m);
		const froms = dockerfile.match(/^FROM .*$/gm) ?? [];
		expect(froms.length).toBeGreaterThan(0);
		for (const from of froms) expect(from).toContain('@${BUN_DIGEST}');
	});

	it('has Dependabot watch actions, the Dockerfile and the packages', async () => {
		const config = await Bun.file(join(repoRoot, '.github/dependabot.yml')).text();
		for (const ecosystem of ['github-actions', 'docker', 'bun']) {
			expect(config).toContain(`package-ecosystem: ${ecosystem}`);
		}
	});
});
