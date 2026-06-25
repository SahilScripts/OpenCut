/**
 * Match media files to transcription scenes by scene number.
 *
 * Naming convention: files are named after the scene number, e.g. scene3.jpg,
 * scene3.png, scene3.mp4 all belong to "scene3". Matching is by EXACT stem
 * equality (after normalization) so "scene1" never matches "scene10".
 *
 * Pure module — no editor/browser imports — so it is fully unit-testable.
 */

import type {
	SceneMatch,
	SceneMediaFile,
	SceneMediaKind,
	TranscriptionScene,
} from "./types";

export const SUPPORTED_IMAGE_EXTENSIONS = [
	"jpg",
	"jpeg",
	"png",
	"webp",
] as const;
export const SUPPORTED_VIDEO_EXTENSIONS = [
	"mp4",
	"mov",
	"webm",
	"mkv",
] as const;

const IMAGE_SET = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);
const VIDEO_SET = new Set<string>(SUPPORTED_VIDEO_EXTENSIONS);

/** Classify a file extension (without dot) as image/video, or null if unsupported. */
export function classifyExtension(extension: string): SceneMediaKind | null {
	const ext = extension.toLowerCase();
	if (IMAGE_SET.has(ext)) return "image";
	if (VIDEO_SET.has(ext)) return "video";
	return null;
}

/** Strip any directory prefix from a path (handles "/", "\\" and webkitRelativePath). */
export function getBaseName(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const last = normalized.split("/").pop() ?? normalized;
	return last;
}

/**
 * The variant folder a path belongs to — the immediate parent directory.
 *
 * For a folder upload the browser gives paths relative to the selected parent,
 * including it as the first segment, e.g. "Scenes/v1/scene3.jpg" -> "v1".
 * Images placed directly in the selected folder ("Scenes/scene3.jpg") fall back
 * to the parent name ("Scenes"); a bare file name ("scene3.jpg") yields "".
 */
export function getFolderName(path: string): string {
	const segments = path
		.replace(/\\/g, "/")
		.split("/")
		.filter((segment) => segment.length > 0);
	if (segments.length < 2) return "";
	return segments[segments.length - 2];
}

/** Split a base file name into its stem and lower-cased extension. */
export function splitNameExt(name: string): {
	stem: string;
	extension: string;
} {
	const base = getBaseName(name);
	const dot = base.lastIndexOf(".");
	if (dot <= 0) {
		return { stem: base, extension: "" };
	}
	return {
		stem: base.slice(0, dot),
		extension: base.slice(dot + 1).toLowerCase(),
	};
}

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * The set of file stems that should be considered a match for a scene id.
 * Handles the common variants: "scene1" <-> "1", with optional separators and
 * leading zeros, while keeping exact equality (so scene1 != scene10).
 */
export function sceneStemForms(sceneId: string): Set<string> {
	const forms = new Set<string>();
	const normalized = normalize(sceneId);
	if (normalized) forms.add(normalized);

	const numericMatch = normalized.match(/^(?:scene)?[ _-]?0*(\d+)$/);
	if (numericMatch) {
		const num = numericMatch[1];
		forms.add(num);
		forms.add(`scene${num}`);
		forms.add(`scene ${num}`);
		forms.add(`scene_${num}`);
		forms.add(`scene-${num}`);
	}
	return forms;
}

/**
 * Does a file stem belong to the given scene id?
 *
 * Compares the expanded form-sets of BOTH sides so matching is symmetric and
 * tolerant of leading zeros (e.g. file "scene03" matches scene "scene3", and
 * vice-versa), while still keeping numbers exact (scene1 never matches scene10).
 */
export function stemMatchesScene(stem: string, sceneId: string): boolean {
	const stemForms = sceneStemForms(stem);
	for (const form of sceneStemForms(sceneId)) {
		if (stemForms.has(form)) return true;
	}
	return false;
}

/**
 * Stable identity key for a file. Uses the relative path (when present) rather
 * than the bare name so the same scene file in different variant folders
 * (e.g. "v1/scene3.jpg" vs "v2/scene3.jpg") stays distinct.
 */
export function fileKey(file: {
	name: string;
	size: number;
	lastModified: number;
	webkitRelativePath?: string;
}): string {
	const path = file.webkitRelativePath || file.name;
	return `${path}__${file.size}__${file.lastModified}`;
}

/**
 * Convert a browser File into a SceneMediaFile, or null if the extension is
 * not a supported image/video type.
 */
export function toSceneMediaFile(file: File): SceneMediaFile | null {
	// Prefer webkitRelativePath when present (folder uploads), else the name.
	const path =
		(file as File & { webkitRelativePath?: string }).webkitRelativePath ||
		file.name;
	const { stem, extension } = splitNameExt(path);
	const kind = classifyExtension(extension);
	if (!kind || stem === "") return null;

	return {
		key: fileKey(file),
		name: getBaseName(path),
		folder: getFolderName(path),
		extension,
		kind,
		file,
	};
}

/** Build a de-duplicated list of supported media files from raw File objects. */
export function buildMediaFiles(files: File[] | FileList): SceneMediaFile[] {
	const byKey = new Map<string, SceneMediaFile>();
	for (const file of Array.from(files)) {
		const mediaFile = toSceneMediaFile(file);
		if (mediaFile && !byKey.has(mediaFile.key)) {
			byKey.set(mediaFile.key, mediaFile);
		}
	}
	return [...byKey.values()];
}

/** Sort candidates deterministically: images before videos, then by name. */
function compareCandidates(a: SceneMediaFile, b: SceneMediaFile): number {
	if (a.kind !== b.kind) return a.kind === "image" ? -1 : 1;
	return a.name.localeCompare(b.name);
}

/** Match each scene to its candidate media files. */
export function matchMediaToScenes(
	scenes: TranscriptionScene[],
	mediaFiles: SceneMediaFile[],
): SceneMatch[] {
	return scenes.map((scene) => {
		const candidates = mediaFiles
			.filter((media) => {
				const { stem } = splitNameExt(media.name);
				return stemMatchesScene(stem, scene.scene);
			})
			.sort(compareCandidates);
		return { scene, candidates };
	});
}

/**
 * The distinct variant folders across the given media files, in a stable
 * display order (natural sort, so "v2" precedes "v10"). These become the
 * columns of the scene-picker table.
 */
export function listFolders(mediaFiles: SceneMediaFile[]): string[] {
	const folders = new Set<string>();
	for (const media of mediaFiles) folders.add(media.folder);
	return [...folders].sort((a, b) =>
		a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
	);
}
