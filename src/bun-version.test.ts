import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

/*
 * One Bun everywhere (review TD-15): `packageManager` in package.json is the pin, CI reads it
 * through setup-bun's `bun-version-file`, and the Dockerfile and `@types/bun` repeat it here.
 * A split hides runtime differences (`bun:sqlite`, the test runner) until the image runs.
 */
const repoRoot = join(import.meta.dir, '..');

async function pinned(): Promise<{ bun: string; types: string }> {
	const pkg = (await Bun.file(join(repoRoot, 'package.json')).json()) as {
		packageManager: string;
		devDependencies: Record<string, string>;
	};
	return {
		bun: pkg.packageManager.replace(/^bun@/, ''),
		types: pkg.devDependencies['@types/bun']
	};
}

describe('the Bun version', () => {
	it('is pinned exactly in package.json', async () => {
		expect((await pinned()).bun).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('is the one the Docker image builds and runs on', async () => {
		const dockerfile = await Bun.file(join(repoRoot, 'Dockerfile')).text();
		expect(dockerfile).toContain(`ARG BUN_VERSION=${(await pinned()).bun}\n`);
		expect(dockerfile).not.toMatch(/FROM oven\/bun:\d/);
	});

	it('is the one CI installs', async () => {
		const ci = await Bun.file(join(repoRoot, '.github/workflows/ci.yml')).text();
		const installs = ci.match(/bun-version[\w-]*:.*/g) ?? [];
		expect(installs.length).toBeGreaterThan(0);
		for (const line of installs) expect(line).toBe('bun-version-file: package.json');
	});

	it('is the one the types describe', async () => {
		const { bun, types } = await pinned();
		expect(types).toBe(bun);
	});
});
