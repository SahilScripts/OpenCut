/**
 * Bulk image motion presets (Ken-Burns-style zoom / pan).
 *
 * A preset is expressed as keyframes on an element's transform properties,
 * relative to the element's own start time (t = 0 .. durationTicks). Every
 * preset writes ALL four animated properties (scaleX, scaleY, positionX,
 * positionY) at both the start and the end, so applying a new preset cleanly
 * overwrites any previously applied one (upsert is keyed by path + time).
 *
 * Pure module — returns plain keyframe descriptors; the editor wiring lives in
 * `apply-motion.ts`. Values: scale 1.0 = 100%; position is in canvas pixels.
 */

export type MotionPropertyPath =
	| "transform.scaleX"
	| "transform.scaleY"
	| "transform.positionX"
	| "transform.positionY";

export interface MotionKeyframe {
	propertyPath: MotionPropertyPath;
	/** Ticks relative to the element's start (0 = clip start). */
	time: number;
	value: number;
	interpolation: "linear";
}

export type MotionPresetId =
	| "none"
	| "zoom-in"
	| "zoom-out"
	| "slow-zoom-in"
	| "slow-zoom-out"
	| "pan-left"
	| "pan-right";

export interface MotionPreset {
	id: MotionPresetId;
	label: string;
	description: string;
}

export const MOTION_PRESETS: MotionPreset[] = [
	{
		id: "zoom-in",
		label: "Zoom In",
		description: "Slowly push in (1.0 → 1.2)",
	},
	{
		id: "zoom-out",
		label: "Zoom Out",
		description: "Slowly pull out (1.2 → 1.0)",
	},
	{
		id: "slow-zoom-in",
		label: "Slow Zoom In",
		description: "Gentle push in (1.0 → 1.08)",
	},
	{
		id: "slow-zoom-out",
		label: "Slow Zoom Out",
		description: "Gentle pull out (1.08 → 1.0)",
	},
	{ id: "pan-left", label: "Pan Left", description: "Drift the frame left" },
	{ id: "pan-right", label: "Pan Right", description: "Drift the frame right" },
	{
		id: "none",
		label: "Reset (static)",
		description: "Remove motion — hold still",
	},
];

const ZOOM = 1.2;
const SLOW_ZOOM = 1.08;
const PAN_SCALE = 1.15;
/** Fraction of canvas width to travel during a pan (kept within the zoom margin). */
const PAN_TRAVEL_FRACTION = 0.07;

interface MotionSpec {
	scaleStart: number;
	scaleEnd: number;
	posXStart: number;
	posXEnd: number;
}

function specFor(presetId: MotionPresetId, panOffset: number): MotionSpec {
	switch (presetId) {
		case "zoom-in":
			return { scaleStart: 1, scaleEnd: ZOOM, posXStart: 0, posXEnd: 0 };
		case "zoom-out":
			return { scaleStart: ZOOM, scaleEnd: 1, posXStart: 0, posXEnd: 0 };
		case "slow-zoom-in":
			return { scaleStart: 1, scaleEnd: SLOW_ZOOM, posXStart: 0, posXEnd: 0 };
		case "slow-zoom-out":
			return { scaleStart: SLOW_ZOOM, scaleEnd: 1, posXStart: 0, posXEnd: 0 };
		case "pan-left":
			return {
				scaleStart: PAN_SCALE,
				scaleEnd: PAN_SCALE,
				posXStart: panOffset,
				posXEnd: -panOffset,
			};
		case "pan-right":
			return {
				scaleStart: PAN_SCALE,
				scaleEnd: PAN_SCALE,
				posXStart: -panOffset,
				posXEnd: panOffset,
			};
		case "none":
			return { scaleStart: 1, scaleEnd: 1, posXStart: 0, posXEnd: 0 };
	}
}

/**
 * Build the keyframes that realize a motion preset for one element.
 * @param durationTicks the element's duration in timeline ticks
 * @param canvasWidth   the project canvas width in pixels (drives pan distance)
 */
export function buildMotionKeyframes({
	presetId,
	durationTicks,
	canvasWidth,
}: {
	presetId: MotionPresetId;
	durationTicks: number;
	canvasWidth: number;
}): MotionKeyframe[] {
	const end = Math.max(0, Math.round(durationTicks));
	if (end <= 0) return [];

	const panOffset = Math.round(Math.max(0, canvasWidth) * PAN_TRAVEL_FRACTION);
	const spec = specFor(presetId, panOffset);

	const pair = (
		propertyPath: MotionPropertyPath,
		startValue: number,
		endValue: number,
	): MotionKeyframe[] => [
		{ propertyPath, time: 0, value: startValue, interpolation: "linear" },
		{ propertyPath, time: end, value: endValue, interpolation: "linear" },
	];

	return [
		...pair("transform.scaleX", spec.scaleStart, spec.scaleEnd),
		...pair("transform.scaleY", spec.scaleStart, spec.scaleEnd),
		...pair("transform.positionX", spec.posXStart, spec.posXEnd),
		...pair("transform.positionY", 0, 0),
	];
}
