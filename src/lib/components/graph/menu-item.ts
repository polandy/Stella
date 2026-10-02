/**
 * One row of a toolbar menu; the check or switch on its right says its state. The focused
 * row keeps the global focus ring as well as its tint: a tint alone is a 1.1:1 change
 * (WCAG 1.4.11, 2.4.7). On a touch screen the row grows to 44px: at the desktop's 32px the
 * owner kept missing the filter switches with a thumb.
 */
export const MENU_ITEM =
	'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left pointer-coarse:min-h-11 text-[13px] text-fg hover:bg-bg-sunken focus:bg-bg-sunken';
