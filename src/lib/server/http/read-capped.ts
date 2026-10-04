/*
 * Reading a body from a server Stella does not control (GitHub's release feed, Immich): up to a
 * cap, and refused beyond it rather than buffered, so a confused or hostile answer cannot fill
 * the server's memory.
 */

/** The body's bytes, or a refusal once it grows past `maxBytes`. */
export async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
	const body = response.body;
	if (!body) return new Uint8Array();

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) throw new Error(`answered with more than ${maxBytes} bytes`);
			chunks.push(value);
		}
	} finally {
		// Cancelling an already finished stream can reject; there is nothing left to free then.
		await reader.cancel().catch(() => {});
	}

	const joined = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		joined.set(chunk, at);
		at += chunk.byteLength;
	}
	return joined;
}
