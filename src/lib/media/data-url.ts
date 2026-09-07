/*
 * Reading a `data:` URL back into bytes. Monica's JSON export embeds every picture that way
 * (docs/02 §2.16), so the importer needs the inverse of what a browser does when it renders one.
 */

/** A string that is not a base64 `data:` URL this can decode. */
export class DataUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DataUrlError';
	}
}

/** What a `data:` URL says when it names no media type. */
const DEFAULT_MIME = 'application/octet-stream';

const DATA_URL = /^data:([^;,]*)(;[^,]*)*;base64,(.*)$/s;

export function decodeDataUrl(value: string): { bytes: Uint8Array; mime: string } {
	const match = DATA_URL.exec(value);
	if (!match) throw new DataUrlError('This is not a base64 data URL.');

	const [, mime, , payload] = match;
	let binary: string;
	try {
		binary = atob(payload);
	} catch {
		throw new DataUrlError('The data URL carries something that is not base64.');
	}

	const bytes = new Uint8Array(binary.length);
	for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
	return { bytes, mime: mime === '' ? DEFAULT_MIME : mime };
}
