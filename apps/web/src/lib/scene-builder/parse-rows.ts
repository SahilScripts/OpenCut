/**
 * Convert raw spreadsheet rows into normalized transcription scenes.
 *
 * Pure module (no spreadsheet-library or browser imports) so it can be
 * unit-tested directly with plain arrays.
 *
 * Columns: A = Scene Number, B = Timestamp ("0:09 - 0:11"), C = Transcription text.
 */

import { parseTimestampRange } from "./timestamp";
import type { ParseResult, TranscriptionScene } from "./types";

/** A spreadsheet cell value as produced by typical xlsx readers. */
export type Cell = string | number | boolean | Date | null | undefined;

function cellToString(cell: Cell): string {
	if (cell === null || cell === undefined) return "";
	if (cell instanceof Date) return cell.toISOString();
	return String(cell).trim();
}

const HEADER_SCENE_LABELS = new Set([
	"scene",
	"scene number",
	"scene no",
	"scene no.",
	"scene #",
	"scene_number",
	"scene num",
	"scenes",
]);

/** Heuristically decide whether the first row is a header rather than data. */
function isHeaderRow(row: Cell[]): boolean {
	const sceneCell = cellToString(row[0]).toLowerCase();
	const timestampCell = cellToString(row[1]).toLowerCase();

	if (HEADER_SCENE_LABELS.has(sceneCell)) return true;
	if (timestampCell.startsWith("time")) return true;
	// A header's timestamp cell never parses as a real range.
	if (
		(sceneCell === "scene" || sceneCell.startsWith("scene ")) &&
		parseTimestampRange(timestampCell) === null
	) {
		return true;
	}
	return false;
}

export function rowsToScenes(rows: Cell[][]): ParseResult {
	const scenes: TranscriptionScene[] = [];
	const warnings: string[] = [];

	rows.forEach((row, index) => {
		const rowNumber = index + 1;

		// Skip a leading header row.
		if (index === 0 && isHeaderRow(row)) {
			return;
		}

		const scene = cellToString(row[0]);
		const timestampRaw = cellToString(row[1]);
		const text = cellToString(row[2]);

		// Entirely blank row — ignore silently.
		if (scene === "" && timestampRaw === "" && text === "") {
			return;
		}

		if (scene === "") {
			warnings.push(`Row ${rowNumber}: missing scene number — skipped.`);
			return;
		}

		const range = parseTimestampRange(timestampRaw);
		if (!range) {
			warnings.push(
				`Row ${rowNumber} (${scene}): could not parse timestamp "${timestampRaw}" — skipped.`,
			);
			return;
		}

		scenes.push({
			scene,
			timestampRaw,
			text,
			startSeconds: range.startSeconds,
			endSeconds: range.endSeconds,
			rowNumber,
		});
	});

	return { scenes, warnings };
}
