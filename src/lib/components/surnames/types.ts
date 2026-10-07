/** A person as the last-name screens show them (docs/02 §2.2.4). */
export interface SurnamePersonView {
	id: string;
	displayName: string;
	avatarPhotoId: string | null;
	isDeceased: boolean;
}
