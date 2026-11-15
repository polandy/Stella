import { ulid } from 'ulid';

/*
 * IdGenerator port — injected wherever logic needs a new id, so units stay deterministic
 * (docs/dev/08 §8.2, §8.3). Production wires `ulidGenerator` (sortable ids, see docs/dev/03 §3.1);
 * tests pass a predictable fake.
 */

export interface IdGenerator {
	next(): string;
}

export const ulidGenerator: IdGenerator = {
	next: () => ulid()
};
