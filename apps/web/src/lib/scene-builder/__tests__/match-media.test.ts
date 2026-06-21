import { describe, expect, test } from "bun:test";
import {
	buildMediaFiles,
	classifyExtension,
	fileKey,
	getBaseName,
	matchMediaToScenes,
	sceneStemForms,
	splitNameExt,
	stemMatchesScene,
	toSceneMediaFile,
} from "../match-media";
import type { TranscriptionScene } from "../types";

/** Minimal File-shaped fake; the pure helpers only read these fields. */
function fakeFile(
	name: string,
	{ size = 1, lastModified = 0, webkitRelativePath = "" } = {},
): File {
	return { name, size, lastModified, webkitRelativePath } as unknown as File;
}

function scene(id: string): TranscriptionScene {
	return {
		scene: id,
		timestampRaw: "0:00 - 0:05",
		text: "",
		startSeconds: 0,
		endSeconds: 5,
		rowNumber: 1,
	};
}

describe("classifyExtension", () => {
	test("classifies images and videos case-insensitively", () => {
		expect(classifyExtension("JPG")).toBe("image");
		expect(classifyExtension("png")).toBe("image");
		expect(classifyExtension("webp")).toBe("image");
		expect(classifyExtension("MP4")).toBe("video");
		expect(classifyExtension("mov")).toBe("video");
	});
	test("returns null for unsupported extensions", () => {
		expect(classifyExtension("gif")).toBeNull();
		expect(classifyExtension("txt")).toBeNull();
		expect(classifyExtension("")).toBeNull();
	});
});

describe("getBaseName", () => {
	test("strips posix, windows, and webkitRelativePath prefixes", () => {
		expect(getBaseName("a/b/scene3.jpg")).toBe("scene3.jpg");
		expect(getBaseName("a\\b\\scene3.jpg")).toBe("scene3.jpg");
		expect(getBaseName("scene3.jpg")).toBe("scene3.jpg");
	});
});

describe("splitNameExt", () => {
	test("splits stem and lower-cased extension", () => {
		expect(splitNameExt("scene3.JPG")).toEqual({
			stem: "scene3",
			extension: "jpg",
		});
		expect(splitNameExt("folder/scene10.mp4")).toEqual({
			stem: "scene10",
			extension: "mp4",
		});
	});
	test("handles names with no extension and dotfiles", () => {
		expect(splitNameExt("scene3")).toEqual({ stem: "scene3", extension: "" });
		expect(splitNameExt(".hidden")).toEqual({ stem: ".hidden", extension: "" });
	});
});

describe("sceneStemForms / stemMatchesScene", () => {
	test("scene1 never matches scene10 (exact equality)", () => {
		expect(stemMatchesScene("scene1", "scene1")).toBe(true);
		expect(stemMatchesScene("scene10", "scene1")).toBe(false);
		expect(stemMatchesScene("scene1", "scene10")).toBe(false);
	});
	test("matches numeric variants and separators", () => {
		expect(stemMatchesScene("3", "scene3")).toBe(true);
		expect(stemMatchesScene("scene 3", "scene3")).toBe(true);
		expect(stemMatchesScene("scene_3", "scene3")).toBe(true);
		expect(stemMatchesScene("scene-3", "scene3")).toBe(true);
		expect(stemMatchesScene("SCENE3", "scene3")).toBe(true);
	});
	test("tolerates leading zeros", () => {
		expect(stemMatchesScene("scene03", "scene3")).toBe(true);
		expect(stemMatchesScene("scene3", "scene03")).toBe(true);
		expect(sceneStemForms("scene007").has("7")).toBe(true);
	});
	test("non-numeric scene ids match only themselves", () => {
		expect(stemMatchesScene("intro", "intro")).toBe(true);
		expect(stemMatchesScene("outro", "intro")).toBe(false);
	});
});

describe("toSceneMediaFile", () => {
	test("builds a media file for a supported type", () => {
		const media = toSceneMediaFile(
			fakeFile("scene3.jpg", { size: 10, lastModified: 5 }),
		);
		expect(media).not.toBeNull();
		expect(media?.kind).toBe("image");
		expect(media?.extension).toBe("jpg");
		expect(media?.name).toBe("scene3.jpg");
	});
	test("prefers webkitRelativePath for folder uploads", () => {
		const media = toSceneMediaFile(
			fakeFile("scene3.jpg", { webkitRelativePath: "uploads/scene3.jpg" }),
		);
		expect(media?.name).toBe("scene3.jpg");
	});
	test("returns null for unsupported types and bare extensions", () => {
		expect(toSceneMediaFile(fakeFile("notes.txt"))).toBeNull();
		expect(toSceneMediaFile(fakeFile(".jpg"))).toBeNull();
	});
});

describe("fileKey / buildMediaFiles", () => {
	test("fileKey combines name, size and lastModified", () => {
		expect(fileKey({ name: "a/scene3.jpg", size: 10, lastModified: 5 })).toBe(
			"scene3.jpg__10__5",
		);
	});
	test("de-duplicates identical files and drops unsupported ones", () => {
		const files = [
			fakeFile("scene1.jpg", { size: 10, lastModified: 1 }),
			fakeFile("scene1.jpg", { size: 10, lastModified: 1 }), // exact dup
			fakeFile("scene2.mp4", { size: 20, lastModified: 2 }),
			fakeFile("readme.txt", { size: 1, lastModified: 3 }), // unsupported
		];
		const built = buildMediaFiles(files);
		expect(built).toHaveLength(2);
		expect(built.map((m) => m.name).sort()).toEqual([
			"scene1.jpg",
			"scene2.mp4",
		]);
	});
});

describe("matchMediaToScenes", () => {
	test("matches by scene number and sorts images before videos", () => {
		const scenes = [scene("scene1"), scene("scene2"), scene("scene10")];
		const media = buildMediaFiles([
			fakeFile("scene1.mp4", { size: 1, lastModified: 1 }),
			fakeFile("scene1.jpg", { size: 2, lastModified: 2 }),
			fakeFile("scene10.png", { size: 3, lastModified: 3 }),
		]);
		const matches = matchMediaToScenes(scenes, media);

		// scene1 has two candidates, image first.
		expect(matches[0].candidates.map((c) => c.name)).toEqual([
			"scene1.jpg",
			"scene1.mp4",
		]);
		// scene2 has none.
		expect(matches[1].candidates).toHaveLength(0);
		// scene10 must not pick up scene1's files.
		expect(matches[2].candidates.map((c) => c.name)).toEqual(["scene10.png"]);
	});
});
