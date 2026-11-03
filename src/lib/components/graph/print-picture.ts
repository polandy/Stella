import { PAGE_MARGIN_MM, printedSize, type Paper } from '$lib/graph/tree-export';
import type { TreeImage } from '$lib/graph/cytoscape/tree-image';

/*
 * Prints the family tree through the browser's own print dialog (docs/02 §2.7) — a printer, or
 * Save as PDF — with no PDF library: for the one print, the page holds nothing but the picture,
 * at the size `printedSize` gives it on the paper, and is handed back afterwards.
 */

const PRINT_ID = 'tree-print';

export async function printPicture(picture: TreeImage, paper: Paper): Promise<void> {
	const { widthMm, heightMm } = printedSize(picture.size, paper);
	const url = URL.createObjectURL(picture.blob);
	const sheet = document.createElement('div');
	sheet.id = PRINT_ID;
	const image = document.createElement('img');
	image.alt = '';
	image.src = url;
	image.style.cssText = `width:${widthMm}mm;height:${heightMm}mm`;
	sheet.append(image);
	const style = document.createElement('style');
	style.textContent = `
@page { size: ${paper === 'a3' ? 'A3' : 'A4'} landscape; margin: ${PAGE_MARGIN_MM}mm; }
@media screen { #${PRINT_ID} { display: none; } }
@media print {
	body > :not(#${PRINT_ID}) { display: none !important; }
	#${PRINT_ID} { display: flex; justify-content: center; }
}`;
	document.head.append(style);
	document.body.append(sheet);
	const done = () => {
		sheet.remove();
		style.remove();
		URL.revokeObjectURL(url);
	};
	try {
		// The print dialog takes the page as it stands; an image still decoding prints blank.
		await image.decode();
	} catch (error) {
		done();
		throw error;
	}
	// `print()` returns at once in some browsers, while their dialog is still up.
	window.addEventListener('afterprint', done, { once: true });
	window.print();
}
