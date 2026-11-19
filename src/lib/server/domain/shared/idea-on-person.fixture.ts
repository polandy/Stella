import type { OwnPersonReads } from './idea-on-person';

/** An in-memory `OwnPersonReads`; `ownPeople` maps a person's id to the member whose own it is. */
export function fakeOwnPeople(ownPeople: Map<string, string> = new Map()): OwnPersonReads {
	return {
		async memberWhoseOwnPerson(_householdId, contactId) {
			return ownPeople.get(contactId) ?? null;
		},
		async membersOwnPeople() {
			return [...ownPeople].map(([contactId, memberId]) => ({ memberId, contactId }));
		}
	};
}
