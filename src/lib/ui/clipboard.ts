/*
 * Copying a secret Settings shows once (the calendar link, an API token). The Clipboard API
 * exists only in a secure context, so on a plain-http address on the LAN it is missing; the
 * older copy-the-selection route still works there.
 */

/** As much of the browser as copying needs. */
export interface ClipboardHost {
	/** Absent outside a secure context. */
	clipboard: Pick<Clipboard, 'writeText'> | undefined;
	/** Copy `text` through a selection; false when the browser refused. */
	copyBySelection: (text: string) => boolean;
}

/** Copy `text`; false when neither route worked and the member has to copy it by hand. */
export async function copyText(text: string, host: ClipboardHost): Promise<boolean> {
	if (host.clipboard) {
		try {
			await host.clipboard.writeText(text);
			return true;
		} catch {
			// Refused (no permission, page not focused): the selection route may still work.
		}
	}
	return host.copyBySelection(text);
}

/** The real browser. */
export function browserClipboard(): ClipboardHost {
	return {
		clipboard: globalThis.isSecureContext ? navigator.clipboard : undefined,
		copyBySelection(text) {
			const field = document.createElement('textarea');
			field.value = text;
			field.setAttribute('readonly', '');
			field.style.position = 'fixed';
			field.style.opacity = '0';
			document.body.append(field);
			field.select();
			try {
				// Deprecated, but the only copy a non-secure page has.
				return document.execCommand('copy');
			} finally {
				field.remove();
			}
		}
	};
}

/** Select an element's text, so the member can copy it by hand. */
export function selectText(element: HTMLElement): void {
	window.getSelection()?.selectAllChildren(element);
}
