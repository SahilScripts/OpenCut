/**
 * Export selected scenes onto the OpenCut timeline.
 *
 * For every scene that has a selected media file we:
 *   1. add the (already-processed) media asset to the project,
 *   2. build an image/video timeline element sized to the scene's timestamp,
 *   3. insert it at the exact start time on a dedicated new video track.
 *
 * Scenes with no selection are simply skipped, leaving a gap — no placeholder,
 * no error. A dedicated track (rather than the main track) is used so exact
 * start times are preserved, since the main track snaps its earliest element
 * to time 0.
 */

import type { EditorCore } from "@/core";
import type { ProcessedMediaAsset } from "@/lib/media/processing";
import type { MediaType } from "@/lib/media/types";
import { buildElementFromMedia } from "@/lib/timeline/element-utils";
import { TICKS_PER_SECOND } from "@/lib/wasm";
import type { SceneMediaFile, TranscriptionScene } from "./types";

export interface SceneExportItem {
	scene: TranscriptionScene;
	/** The chosen media file for this scene. */
	media: SceneMediaFile;
	/** The processed asset (thumbnail / dimensions / duration) for the chosen file. */
	asset: ProcessedMediaAsset;
}

export interface ExportResult {
	trackId: string | null;
	placed: number;
	skipped: number;
	warnings: string[];
}

const secondsToTicks = (seconds: number): number =>
	Math.round(seconds * TICKS_PER_SECOND);

export async function exportScenesToTimeline({
	editor,
	items,
}: {
	editor: EditorCore;
	items: SceneExportItem[];
}): Promise<ExportResult> {
	const project = editor.project.getActiveOrNull();
	if (!project) {
		return {
			trackId: null,
			placed: 0,
			skipped: items.length,
			warnings: ["No active project."],
		};
	}
	const projectId = project.metadata.id;

	// Place clips in chronological order on a fresh video track so explicit
	// placement never trips over an out-of-order overlap.
	const ordered = [...items].sort(
		(a, b) => a.scene.startSeconds - b.scene.startSeconds,
	);

	const trackId = editor.timeline.addTrack({ type: "video" });

	let placed = 0;
	let skipped = 0;
	const warnings: string[] = [];

	for (const item of ordered) {
		const durationTicks = secondsToTicks(
			item.scene.endSeconds - item.scene.startSeconds,
		);
		const startTicks = secondsToTicks(item.scene.startSeconds);

		if (durationTicks <= 0) {
			skipped += 1;
			warnings.push(
				`${item.scene.scene}: timestamp duration is zero — skipped.`,
			);
			continue;
		}

		const saved = await editor.media.addMediaAsset({
			projectId,
			asset: item.asset,
		});
		if (!saved) {
			skipped += 1;
			warnings.push(`${item.scene.scene}: could not store media — skipped.`);
			continue;
		}

		const element = buildElementFromMedia({
			mediaId: saved.id,
			mediaType: item.asset.type as MediaType,
			name: item.asset.name,
			duration: durationTicks,
			startTime: startTicks,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "explicit", trackId },
		});
		placed += 1;
	}

	return { trackId, placed, skipped, warnings };
}
