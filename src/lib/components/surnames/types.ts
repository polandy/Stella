/** A person as the last-name screens show them (docs/concepts/surnames.md §3). */
export interface SurnamePersonView {
	id: string;
	displayName: string;
	avatarPhotoId: string | null;
	isDeceased: boolean;
}
