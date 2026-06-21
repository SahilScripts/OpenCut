/**
 * Scene Builder (Transcription → Timeline): shared types.
 *
 * This feature turns a transcription spreadsheet (.xlsx) plus one or more
 * media folders into a fully populated OpenCut timeline. The pure data types
 * live here so the parsing / matching / motion logic can be unit-tested in
 * isolation from the editor and the browser.
 *
 * NOTE: This is distinct from `@/lib/transcription`, which is the existing
 * audio speech-to-text / captions feature.
 */

/** A media file is classified purely by its file extension. */
export type SceneMediaKind = "image" | "video";

/** One row of the transcription spreadsheet, normalized. */
export interface TranscriptionScene {
	/** Scene identifier from column A, e.g. "scene1" (trimmed, original case kept for display). */
	scene: string;
	/** Raw timestamp string from column B, e.g. "0:09 - 0:11". */
	timestampRaw: string;
	/** Transcription text from column C. */
	text: string;
	/** Start time in seconds, parsed from the timestamp range. */
	startSeconds: number;
	/** End time in seconds, parsed from the timestamp range. */
	endSeconds: number;
	/** 1-based source row number in the spreadsheet (for error reporting). */
	rowNumber: number;
}

/** A media file that has been matched to a scene by its scene number. */
export interface SceneMediaFile {
	/** Stable identity key for this file (name + size + lastModified). */
	key: string;
	/** Base file name including extension, e.g. "scene3.jpg". */
	name: string;
	/** Lower-cased extension without the dot, e.g. "jpg". */
	extension: string;
	/** image | video. */
	kind: SceneMediaKind;
	/** The underlying browser File. */
	file: File;
}

/** All media files matched to a single scene. */
export interface SceneMatch {
	scene: TranscriptionScene;
	/** Candidate media files for this scene (may be empty). */
	candidates: SceneMediaFile[];
}

/** Result of parsing a transcription spreadsheet. */
export interface ParseResult {
	scenes: TranscriptionScene[];
	/** Human-readable warnings for rows that were skipped or partially invalid. */
	warnings: string[];
}
