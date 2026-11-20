import { enhance as kitEnhance, type SubmitFunction } from '$app/forms';
import { stayOnPage } from './stay-on-page';

type Shape = Record<string, unknown> | undefined;

/** `$app/forms`' `enhance`, answering on the page the form sits on (`stay-on-page.ts`). */
export function enhance<Success extends Shape, Failure extends Shape>(
	form: HTMLFormElement,
	submit?: SubmitFunction<Success, Failure>
) {
	return kitEnhance(form, stayOnPage(submit));
}
