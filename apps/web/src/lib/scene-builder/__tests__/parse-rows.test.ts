import { describe, expect, test } from "bun:test";
import { type Cell, rowsToScenes } from "../parse-rows";

describe("rowsToScenes", () => {
	test("parses well-formed rows with a header", () => {
		const rows: Cell[][] = [
			["Scene", "Timestamp", "Text"],
			["scene1", "0:00 - 0:05", "Meditation begins"],
			["scene2", "0:05 - 0:10", "Sadhguru starts speaking"],
		];
		const { scenes, warnings } = rowsToScenes(rows);
		expect(warnings).toHaveLength(0);
		expect(scenes).toHaveLength(2);
		expect(scenes[0]).toMatchObject({
			scene: "scene1",
			startSeconds: 0,
			endSeconds: 5,
			text: "Meditation begins",
			rowNumber: 2,
		});
	});

	test("works without a header row", () => {
		const rows: Cell[][] = [["scene1", "0:00 - 0:05", "Hello"]];
		const { scenes } = rowsToScenes(rows);
		expect(scenes).toHaveLength(1);
		expect(scenes[0].scene).toBe("scene1");
	});

	test("warns and skips rows with bad timestamps", () => {
		const rows: Cell[][] = [
			["scene1", "0:00 - 0:05", "ok"],
			["scene2", "not a time", "bad"],
		];
		const { scenes, warnings } = rowsToScenes(rows);
		expect(scenes).toHaveLength(1);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("scene2");
	});

	test("warns on missing scene number", () => {
		const rows: Cell[][] = [["", "0:00 - 0:05", "text"]];
		const { scenes, warnings } = rowsToScenes(rows);
		expect(scenes).toHaveLength(0);
		expect(warnings[0]).toContain("missing scene number");
	});

	test("ignores fully blank rows silently", () => {
		const rows: Cell[][] = [
			["scene1", "0:00 - 0:05", "ok"],
			["", "", ""],
			[null, null, null],
		];
		const { scenes, warnings } = rowsToScenes(rows);
		expect(scenes).toHaveLength(1);
		expect(warnings).toHaveLength(0);
	});

	test("coerces numeric scene ids and trims text", () => {
		const rows: Cell[][] = [[1, "0:00 - 0:05", "  spaced  "]];
		const { scenes } = rowsToScenes(rows);
		expect(scenes[0].scene).toBe("1");
		expect(scenes[0].text).toBe("spaced");
	});
});
