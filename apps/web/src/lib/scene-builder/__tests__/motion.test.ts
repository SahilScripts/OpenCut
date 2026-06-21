import { describe, expect, test } from "bun:test";
import {
	buildMotionKeyframes,
	MOTION_PRESETS,
	type MotionPropertyPath,
} from "../motion";

const DURATION = 5_000;
const CANVAS = 1920;

/** Pull the {start,end} value pair for a property out of a keyframe list. */
function pair(
	keyframes: ReturnType<typeof buildMotionKeyframes>,
	path: MotionPropertyPath,
) {
	const kfs = keyframes.filter((k) => k.propertyPath === path);
	const start = kfs.find((k) => k.time === 0)?.value;
	const end = kfs.find((k) => k.time === DURATION)?.value;
	return { start, end };
}

describe("buildMotionKeyframes", () => {
	test("returns nothing for a non-positive duration", () => {
		expect(
			buildMotionKeyframes({
				presetId: "zoom-in",
				durationTicks: 0,
				canvasWidth: CANVAS,
			}),
		).toEqual([]);
		expect(
			buildMotionKeyframes({
				presetId: "zoom-in",
				durationTicks: -10,
				canvasWidth: CANVAS,
			}),
		).toEqual([]);
	});

	test("every preset writes all four properties at t=0 and t=end", () => {
		for (const preset of MOTION_PRESETS) {
			const keyframes = buildMotionKeyframes({
				presetId: preset.id,
				durationTicks: DURATION,
				canvasWidth: CANVAS,
			});
			// 4 properties x 2 endpoints = 8 keyframes.
			expect(keyframes).toHaveLength(8);
			for (const path of [
				"transform.scaleX",
				"transform.scaleY",
				"transform.positionX",
				"transform.positionY",
			] as MotionPropertyPath[]) {
				const p = pair(keyframes, path);
				expect(p.start).toBeDefined();
				expect(p.end).toBeDefined();
			}
		}
	});

	test("zoom-in scales 1.0 -> 1.2, zoom-out reverses it", () => {
		const zin = buildMotionKeyframes({
			presetId: "zoom-in",
			durationTicks: DURATION,
			canvasWidth: CANVAS,
		});
		expect(pair(zin, "transform.scaleX")).toEqual({ start: 1, end: 1.2 });
		expect(pair(zin, "transform.scaleY")).toEqual({ start: 1, end: 1.2 });

		const zout = buildMotionKeyframes({
			presetId: "zoom-out",
			durationTicks: DURATION,
			canvasWidth: CANVAS,
		});
		expect(pair(zout, "transform.scaleX")).toEqual({ start: 1.2, end: 1 });
	});

	test("'none' resets every property to a static identity", () => {
		const none = buildMotionKeyframes({
			presetId: "none",
			durationTicks: DURATION,
			canvasWidth: CANVAS,
		});
		expect(pair(none, "transform.scaleX")).toEqual({ start: 1, end: 1 });
		expect(pair(none, "transform.positionX")).toEqual({ start: 0, end: 0 });
		expect(pair(none, "transform.positionY")).toEqual({ start: 0, end: 0 });
	});

	test("pan-left and pan-right travel in opposite directions over a fixed zoom", () => {
		const offset = Math.round(CANVAS * 0.07);
		const left = buildMotionKeyframes({
			presetId: "pan-left",
			durationTicks: DURATION,
			canvasWidth: CANVAS,
		});
		expect(pair(left, "transform.positionX")).toEqual({
			start: offset,
			end: -offset,
		});
		// Pans hold a constant zoom so there is headroom to move.
		expect(pair(left, "transform.scaleX")).toEqual({ start: 1.15, end: 1.15 });

		const right = buildMotionKeyframes({
			presetId: "pan-right",
			durationTicks: DURATION,
			canvasWidth: CANVAS,
		});
		expect(pair(right, "transform.positionX")).toEqual({
			start: -offset,
			end: offset,
		});
	});

	test("keyframe end time tracks the (rounded) duration", () => {
		const keyframes = buildMotionKeyframes({
			presetId: "zoom-in",
			durationTicks: 1234.6,
			canvasWidth: CANVAS,
		});
		const times = new Set(keyframes.map((k) => k.time));
		expect(times.has(0)).toBe(true);
		expect(times.has(1235)).toBe(true);
	});
});
