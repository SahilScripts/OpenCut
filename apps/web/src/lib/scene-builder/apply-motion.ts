/**
 * Apply a motion preset to every IMAGE clip on the timeline at once.
 *
 * Video clips are intentionally left untouched. Motion is realized as transform
 * keyframes (see `motion.ts`); because every preset writes all four animated
 * properties at t=0 and t=duration, switching presets cleanly overwrites the
 * previous one.
 */

import type { EditorCore } from "@/core";
import type {
	AnimationInterpolation,
	AnimationPath,
} from "@/lib/animation/types";
import { buildMotionKeyframes, type MotionPresetId } from "./motion";

const DEFAULT_CANVAS_WIDTH = 1920;

export interface ApplyMotionResult {
	/** Number of image clips the preset was applied to. */
	imageCount: number;
}

export function applyMotionToImages({
	editor,
	presetId,
}: {
	editor: EditorCore;
	presetId: MotionPresetId;
}): ApplyMotionResult {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) return { imageCount: 0 };

	const canvasWidth =
		editor.project.getActiveOrNull()?.settings.canvasSize.width ??
		DEFAULT_CANVAS_WIDTH;

	const tracks = [scene.tracks.main, ...scene.tracks.overlay];

	const keyframes: Array<{
		trackId: string;
		elementId: string;
		propertyPath: AnimationPath;
		time: number;
		value: number;
		interpolation: AnimationInterpolation;
	}> = [];
	let imageCount = 0;

	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type !== "image") continue;
			imageCount += 1;

			const elementKeyframes = buildMotionKeyframes({
				presetId,
				durationTicks: element.duration,
				canvasWidth,
			});

			for (const keyframe of elementKeyframes) {
				keyframes.push({
					trackId: track.id,
					elementId: element.id,
					propertyPath: keyframe.propertyPath,
					time: keyframe.time,
					value: keyframe.value,
					interpolation: keyframe.interpolation,
				});
			}
		}
	}

	if (keyframes.length > 0) {
		editor.timeline.upsertKeyframes({ keyframes });
	}

	return { imageCount };
}
