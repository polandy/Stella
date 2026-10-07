import { describe, expect, it } from 'bun:test';
import { showsActorBadge } from './actor-badge';

/*
 * A stream row leads with its subject's face; who wrote it is in the sentence. The small actor
 * badge on that face (docs/05 §5.5) is for telling members apart, so it only appears where
 * there is somebody to tell apart from the reader.
 */
const me = { id: 'u-me' };
const lena = { id: 'u-lena' };

describe('showsActorBadge', () => {
	it('marks a row another member wrote, in a household with a choice of members', () => {
		expect(showsActorBadge({ mine: false }, [me, lena])).toBe(true);
	});

	it("leaves the reader's own rows plain: You is what a reader assumes", () => {
		expect(showsActorBadge({ mine: true }, [me, lena])).toBe(false);
	});

	it('shows nothing in a household of one, where there is nobody to tell apart', () => {
		// A row by a member who has since left still reads as theirs in the sentence.
		expect(showsActorBadge({ mine: false }, [me])).toBe(false);
	});
});
