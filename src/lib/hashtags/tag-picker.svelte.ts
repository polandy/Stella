import {
	chooseRow,
	followCaret,
	moveHighlight,
	suggestTags,
	TAG_LIST_CLOSED,
	tagListKey,
	tagRows,
	type KnownTag,
	type TagListState,
	type TagRow
} from './picker';

/*
 * The `#` list's state beside whatever field hosts it (docs/02 §2.20.2) — the browser half of
 * `picker.ts`, which holds every decision. It only reads the text and caret it is handed and
 * gives back the text a choice makes, so a host keeps owning its text: the journal's field and
 * the moment composer both use it next to their `@` list. The two never open together — a
 * caret is in a handle or in a tag.
 */
export class TagPicker {
	#state = $state<TagListState>(TAG_LIST_CLOSED);
	readonly #known: () => readonly KnownTag[];
	readonly rows: TagRow[] = $derived.by(() =>
		this.#state.active ? tagRows(suggestTags(this.#state.active.query, this.#known())) : []
	);

	constructor(known: () => readonly KnownTag[]) {
		this.#known = known;
	}

	get open(): boolean {
		return this.rows.length > 0;
	}

	get highlighted(): number {
		return this.#state.highlighted;
	}

	set highlighted(index: number) {
		this.#state = { ...this.#state, highlighted: index };
	}

	follow(text: string, caret: number): void {
		this.#state = followCaret(text, caret);
	}

	close(): void {
		this.#state = TAG_LIST_CLOSED;
	}

	move(by: 1 | -1): void {
		this.#state = moveHighlight(this.#state, by, this.rows.length);
	}

	/**
	 * A key pressed in the host field. While the list is open it takes the arrows, Escape, and
	 * Enter or Tab, which it hands to `onChoose` with the highlighted row; true when it took one.
	 */
	key(event: KeyboardEvent, onChoose: (index: number) => void): boolean {
		const intent = this.open ? tagListKey(event.key) : null;
		if (!intent) return false;
		event.preventDefault();
		if (intent === 'next') this.move(1);
		else if (intent === 'previous') this.move(-1);
		else if (intent === 'choose') onChoose(this.highlighted);
		else this.close();
		return true;
	}

	/** The text with row `index` written in, and where the caret goes; the list closes. */
	choose(
		text: string,
		caret: number,
		index = this.highlighted
	): { text: string; caret: number } | null {
		const result = chooseRow(text, caret, this.#state, this.rows[index]);
		if (result) this.close();
		return result;
	}
}
