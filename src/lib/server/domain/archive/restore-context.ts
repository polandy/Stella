import type { IdGenerator } from '../../id';
import type { AnswerWarning } from './restore-answers';
import type { Row } from './restore-fields';

/*
 * What every part of `planRestore` shares (docs/02 §2.15): the warnings it can raise, and the
 * household the rows go into with its rules for authorship and stamps. Each `restore-*.ts`
 * planner takes one table group's records and this context, and hands back rows.
 */

/** The kinds of pointer a restore can find dangling. */
export type MentionKind = 'noteMentions' | 'journalMentions' | 'touchpointParticipants';

/**
 * Something the restore left out, as a code the page words (docs/02 §2.19). The plan is a
 * domain module and has no language of its own; the report says *what* happened and the
 * wizard says it in the reader's.
 */
export type RestoreWarning =
	| { code: 'personWithoutName' }
	| { code: 'photoWithoutFile' }
	| { code: 'photoBadPath'; file: string }
	| { code: 'pointedAtMissingPeople'; what: MentionKind }
	| { code: 'contactFieldIncomplete' }
	| { code: 'importantDateIncomplete' }
	| { code: 'noteWithoutText' }
	| { code: 'journalEntryIncomplete' }
	| { code: 'touchpointIncomplete' }
	| { code: 'giftIncomplete' }
	| { code: 'todoIncomplete' }
	| { code: 'tagWithoutName' }
	| { code: 'tagsNotInList' }
	| { code: 'immichLinkIncomplete' }
	| { code: 'immichIgnoreIncomplete' }
	| { code: 'circleWithoutName' }
	| { code: 'circleMissingParent'; name: string }
	| { code: 'circleMemberMissing'; name: string }
	/** A shared address without its line, or with nobody of the archive living there. */
	| { code: 'homeIncomplete' }
	| { code: 'homeMembersMissing' }
	| { code: 'relationshipTypeWithoutName' }
	| { code: 'relationshipMissingEnd' }
	| { code: 'relationshipsMissingPeople' }
	| { code: 'relationshipUnknownType' }
	/** The same symmetric link from both ends, restored once (docs/03 §relationship). */
	| { code: 'relationshipTwinFolded' }
	| { code: 'relationshipToItself' }
	| { code: 'imagesMissing'; count: number }
	/** Images the archive carried that could not be stored here — a full disk, most likely. */
	| { code: 'imagesNotStored'; count: number }
	/** Rows of `table` whose person, entry or circle is not here, so they were left out. */
	| { code: 'rowsWithoutParent'; table: string; count: number }
	/** Gift notes or gift touchpoints the archive held, made gift records (docs/02 §2.25.4). */
	| { code: 'giftsConverted'; count: number }
	| AnswerWarning;

export interface RestoreContext {
	householdId: string;
	ids: IdGenerator;
	/** The moment of the import, for rows the archive gives no time of their own. */
	now: number;
	/** The members here; a person who is not one is never named as an author. */
	members: ReadonlySet<string>;
	/** Authorship survives a restore into its own installation; otherwise it is the admin's. */
	author: (row: Row, key?: string) => string;
	stamps: (row: Row) => { created_at: number; updated_at: number };
	/** Report something left out; the same warning twice is reported once. */
	warn: (warning: RestoreWarning) => void;
}
