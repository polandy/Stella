/*
 * The two ends of a relationship row. Shared vocabulary: the domain stores them, and the
 * picker decides which way round they go (`type-options.ts`), so the shape has one home.
 */

/** A relationship as stored: `from` is the side the type's forward label reads from. */
export interface Endpoints {
	fromContactId: string;
	toContactId: string;
}
