/*
 * Prints the docs/dev/features subsections that no e2e header cites and that are not marked
 * unit (docs/dev/08 §8.4). Report only: it never fails a build. Run by spec-coverage.sh.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coverageGaps, type FeatureFile, type SpecFile } from '../src/lib/spec-coverage';

const root = join(import.meta.dir, '..');

const features: FeatureFile[] = readdirSync(join(root, 'docs/dev/features'))
	.filter((name) => name.endsWith('.md'))
	.sort()
	.map((name) => ({
		file: `docs/dev/features/${name}`,
		markdown: readFileSync(join(root, 'docs/dev/features', name), 'utf8')
	}));

const specs: SpecFile[] = readdirSync(join(root, 'e2e'))
	.filter((name) => name.endsWith('.spec.ts'))
	.sort()
	.map((name) => ({
		file: `e2e/${name}`,
		source: readFileSync(join(root, 'e2e', name), 'utf8')
	}));

const gaps = coverageGaps(features, specs);

for (const gap of gaps) {
	console.log(`§${gap.id}  ${gap.heading}  (${gap.file})`);
}

if (gaps.length === 0) {
	console.log('Every features subsection is cited by an e2e header or marked unit.');
} else {
	console.log(
		`\n${gaps.length} subsection(s) no e2e header cites and no unit mark says are covered.`
	);
}
