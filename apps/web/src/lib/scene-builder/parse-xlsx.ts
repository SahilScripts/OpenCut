/**
 * Read a transcription spreadsheet (.xlsx) in the browser and normalize it
 * into scenes. Thin wrapper around `read-excel-file`; the real logic lives in
 * the pure `rowsToScenes` so it can be unit-tested.
 */

// read-excel-file v9 has no root export and the default export returns ALL
// sheets ({ sheet, data }[]). We want a single sheet's rows, so we use the
// named `readSheet` from the browser entry (reads on the main thread — fine
// for the small transcription spreadsheets this feature handles).
import { readSheet } from "read-excel-file/browser";
import { type Cell, rowsToScenes } from "./parse-rows";
import type { ParseResult } from "./types";

export async function parseTranscriptionFile(file: File): Promise<ParseResult> {
	// `readSheet` returns SheetData (Row[]); its CellValue typing uses
	// `typeof Date` for dates, so we widen through unknown to our Cell type.
	const rows = (await readSheet(file)) as unknown as Cell[][];
	return rowsToScenes(rows);
}
