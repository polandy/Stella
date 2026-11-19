import { expect, test } from 'bun:test';
import { Glob } from 'bun';

test('no page or shell <main> pads the desktop way on a phone, so the edges do not jump between screens', async () => {
	const offenders: string[] = [];
	for (const pattern of ['src/routes/(app)/**/+page.svelte', 'src/lib/components/shell/*.svelte']) {
		for await (const file of new Glob(pattern).scan('.')) {
			const text = await Bun.file(file).text();
			for (const tag of text.matchAll(/<main\b[^>]*?(?=>)/gs)) {
				if (/(?<![:\w-])(px-6|py-10)\b/.test(tag[0])) offenders.push(file);
			}
		}
	}
	expect(offenders).toEqual([]);
});
