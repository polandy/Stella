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

/** How a base64 payload is announced at the end of the header. */
const BASE64_MARKER = ';base64';

const PREFIX = 'data:';

/**
 * Read a base64 `data:` URL into bytes and its media type.
 *
 * Parsed by hand rather than with one regular expression on purpose: the string comes
 * straight out of an uploaded file and can be hundreds of megabytes, and the obvious pattern
 * for a data-URL header (`([^;,]*)(;[^,]*)*`) can be made to backtrack exponentially, so a
 * crafted export would hang the request. Two index lookups cannot.
 */
export function decodeDataUrl(value: string): { bytes: Uint8Array; mime: string } {
	const comma = value.indexOf(',');
	if (!value.startsWith(PREFIX) || comma === -1) {
		throw new DataUrlError('This is not a base64 data URL.');
	}

	const header = value.slice(PREFIX.length, comma);
	if (!header.endsWith(BASE64_MARKER)) {
		throw new DataUrlError('This data URL does not carry its payload as base64.');
	}

	let binary: string;
	try {
		binary = atob(value.slice(comma + 1));
	} catch {
		throw new DataUrlError('The data URL carries something that is not base64.');
	}

	const bytes = new Uint8Array(binary.length);
	for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
	// Anything after the media type is a parameter (charset, …) and not part of it.
	return { bytes, mime: header.split(';')[0] || DEFAULT_MIME };
}
