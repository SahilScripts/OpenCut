/**
 * Timestamp parsing for the Scene Builder.
 *
 * Spreadsheet timestamps look like:
 *   "0:09 - 0:11"
 *   "1:32 - 1:38"
 *   "1:02:05 - 1:02:09"   (h:mm:ss)
 *
 * The separator may be a hyphen, en/em dash, or the word "to". Each side may
 * be ss, m:ss, or h:mm:ss, optionally with fractional seconds (m:ss.5).
 *
 * Pure module — no imports, fully unit-testable.
 */

const RANGE_SEPARATOR = /\s*(?:-|–|—|to|→)\s*/i;

/**
 * Parse a single clock value into seconds.
 * Accepts "ss", "m:ss", "h:mm:ss" with optional fractional seconds.
 * Returns null if the value is not a valid clock.
 */
export function parseClock(value: string): number | null {
	const trimmed = value.trim();
	if (trimmed === "") return null;

	const parts = trimmed.split(":");
	if (parts.length > 3) return null;

	let seconds = 0;
	for (const part of parts) {
		// Each segment must be a non-negative number (the seconds segment may be fractional).
		if (!/^\d+(?:\.\d+)?$/.test(part.trim())) {
			return null;
		}
		seconds = seconds * 60 + Number.parseFloat(part);
	}

	return seconds;
}

export interface TimestampRange {
	startSeconds: number;
	endSeconds: number;
}

/**
 * Parse a "start - end" timestamp range into seconds.
 * Returns null if the range cannot be parsed or is not strictly ordered
 * (end must be greater than start).
 */
export function parseTimestampRange(raw: string): TimestampRange | null {
	if (raw == null) return null;
	const text = String(raw).trim();
	if (text === "") return null;

	const parts = text.split(RANGE_SEPARATOR).filter((p) => p.trim() !== "");
	if (parts.length !== 2) return null;

	const startSeconds = parseClock(parts[0]);
	const endSeconds = parseClock(parts[1]);

	if (startSeconds === null || endSeconds === null) return null;
	if (endSeconds <= startSeconds) return null;

	return { startSeconds, endSeconds };
}

/** Format seconds as a compact clock for display, e.g. 9 → "0:09", 95 → "1:35". */
export function formatClock(totalSeconds: number): string {
	const safe = Math.max(0, totalSeconds);
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const seconds = Math.floor(safe % 60);
	const pad = (n: number) => n.toString().padStart(2, "0");

	if (hours > 0) {
		return `${hours}:${pad(minutes)}:${pad(seconds)}`;
	}
	return `${minutes}:${pad(seconds)}`;
}

/** Human-readable duration, e.g. 2 → "2.0s". */
export function formatDuration(seconds: number): string {
	return `${seconds.toFixed(1)}s`;
}
