"use client";

import {
	Alert02Icon,
	CheckmarkCircle02Icon,
	CloudUploadIcon,
	DocumentAttachmentIcon,
	Film01Icon,
	Folder03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useEditor } from "@/hooks/use-editor";
import { processMediaAssets } from "@/lib/media/processing";
import { applyMotionToImages } from "@/lib/scene-builder/apply-motion";
import {
	exportScenesToTimeline,
	type SceneExportItem,
} from "@/lib/scene-builder/build-timeline";
import {
	buildMediaFiles,
	matchMediaToScenes,
} from "@/lib/scene-builder/match-media";
import {
	MOTION_PRESETS,
	type MotionPresetId,
} from "@/lib/scene-builder/motion";
import { parseTranscriptionFile } from "@/lib/scene-builder/parse-xlsx";
import { formatClock } from "@/lib/scene-builder/timestamp";
import type { SceneMatch } from "@/lib/scene-builder/types";
import { cn } from "@/utils/ui";

/** Sentinel value used by the per-scene <Select> to mean "place nothing". */
const NONE = "__none__";

/** A scene paired with the media file the user chose for it. */
type ChosenScene = {
	scene: SceneMatch["scene"];
	media: SceneMatch["candidates"][number];
};

export function SceneBuilderView() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());

	const xlsxInputRef = useRef<HTMLInputElement>(null);
	const mediaInputRef = useRef<HTMLInputElement>(null);

	const [xlsxName, setXlsxName] = useState<string | null>(null);
	const [scenes, setScenes] = useState<SceneMatch["scene"][]>([]);
	const [parseWarnings, setParseWarnings] = useState<string[]>([]);
	const [mediaFiles, setMediaFiles] = useState<
		ReturnType<typeof buildMediaFiles>
	>([]);
	const [mediaFolderName, setMediaFolderName] = useState<string | null>(null);

	// scene.rowNumber -> chosen media key (or NONE). Absent => default candidate.
	const [selections, setSelections] = useState<Record<number, string>>({});
	const [presetId, setPresetId] = useState<MotionPresetId>("none");

	const [isParsing, setIsParsing] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [exportProgress, setExportProgress] = useState(0);

	const matches = useMemo(
		() => matchMediaToScenes(scenes, mediaFiles),
		[scenes, mediaFiles],
	);

	/** The effective media key for a scene: explicit choice, else first candidate. */
	const selectedKeyFor = (match: SceneMatch): string => {
		const explicit = selections[match.scene.rowNumber];
		if (explicit !== undefined) return explicit;
		return match.candidates[0]?.key ?? NONE;
	};

	const readyCount = matches.reduce((count, match) => {
		const key = selectedKeyFor(match);
		return key !== NONE && match.candidates.some((c) => c.key === key)
			? count + 1
			: count;
	}, 0);

	const matchedSceneCount = matches.filter(
		(m) => m.candidates.length > 0,
	).length;

	async function onXlsxChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		setIsParsing(true);
		try {
			const result = await parseTranscriptionFile(file);
			setScenes(result.scenes);
			setParseWarnings(result.warnings);
			setSelections({});
			setXlsxName(file.name);
			if (result.scenes.length === 0) {
				toast.error("No usable rows found in that spreadsheet");
			}
		} catch (error) {
			console.error("Failed to read transcription file:", error);
			toast.error("Could not read that spreadsheet", {
				description: "Make sure it is a valid .xlsx file.",
			});
		} finally {
			setIsParsing(false);
		}
	}

	function onMediaChange(event: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(event.target.files ?? []);
		event.target.value = "";
		if (files.length === 0) return;

		const built = buildMediaFiles(files);
		setMediaFiles(built);
		setSelections({});

		// Derive a folder label from the first file's relative path, if any.
		const relPath = (files[0] as File & { webkitRelativePath?: string })
			.webkitRelativePath;
		setMediaFolderName(
			relPath ? relPath.split("/")[0] : `${files.length} files`,
		);

		if (built.length === 0) {
			toast.error("No supported images or videos in that folder");
		}
	}

	function openMediaPicker() {
		const input = mediaInputRef.current;
		if (!input) return;
		// Enable directory selection (non-standard attribute; set imperatively).
		input.setAttribute("webkitdirectory", "");
		input.setAttribute("directory", "");
		input.click();
	}

	async function handleExport() {
		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		const chosen = matches
			.map((match): ChosenScene | null => {
				const key = selectedKeyFor(match);
				const media = match.candidates.find((c) => c.key === key);
				return media ? { scene: match.scene, media } : null;
			})
			.filter((item): item is ChosenScene => item !== null);

		if (chosen.length === 0) {
			toast.error("Pick media for at least one scene first");
			return;
		}

		setIsExporting(true);
		setExportProgress(0);
		try {
			const processed = await processMediaAssets({
				files: chosen.map((c) => c.media.file),
				onProgress: ({ progress }) => setExportProgress(progress),
			});
			const assetByFile = new Map(processed.map((a) => [a.file, a]));

			const items: SceneExportItem[] = [];
			for (const { scene, media } of chosen) {
				const asset = assetByFile.get(media.file);
				if (asset) items.push({ scene, media, asset });
			}

			const result = await exportScenesToTimeline({ editor, items });

			if (presetId !== "none" && result.placed > 0) {
				applyMotionToImages({ editor, presetId });
			}

			if (result.placed > 0) {
				toast.success(
					`Added ${result.placed} scene${result.placed === 1 ? "" : "s"} to the timeline`,
				);
			} else {
				toast.error("Nothing could be placed on the timeline");
			}
			if (result.warnings.length > 0) {
				console.warn("Scene builder warnings:", result.warnings);
				toast.warning(
					`${result.warnings.length} scene${result.warnings.length === 1 ? "" : "s"} skipped`,
					{ description: result.warnings[0] },
				);
			}
		} catch (error) {
			console.error("Failed to build timeline:", error);
			toast.error("Failed to build the timeline");
		} finally {
			setIsExporting(false);
			setExportProgress(0);
		}
	}

	const busy = isParsing || isExporting;

	return (
		<>
			<input
				ref={xlsxInputRef}
				type="file"
				accept=".xlsx"
				style={{ display: "none" }}
				onChange={onXlsxChange}
			/>
			<input
				ref={mediaInputRef}
				type="file"
				multiple
				style={{ display: "none" }}
				onChange={onMediaChange}
			/>

			<PanelView
				title="Scene Builder"
				actions={
					<Button
						size="sm"
						variant="default"
						disabled={busy || readyCount === 0 || !activeProject}
						onClick={handleExport}
						className="gap-1.5"
					>
						<HugeiconsIcon icon={Film01Icon} />
						{isExporting
							? "Building…"
							: readyCount > 0
								? `Add ${readyCount} to timeline`
								: "Add to timeline"}
					</Button>
				}
				className="select-none"
				contentClassName="flex flex-col gap-3 pb-4"
			>
				<p className="text-muted-foreground text-xs leading-relaxed">
					Turn a transcription spreadsheet into a timeline. Files named after
					each scene (e.g. <code className="text-foreground">scene3.jpg</code>)
					are matched automatically and placed at their timestamps.
				</p>

				<StepButton
					icon={DocumentAttachmentIcon}
					label="Transcription (.xlsx)"
					value={
						xlsxName
							? `${scenes.length} scene${scenes.length === 1 ? "" : "s"} · ${xlsxName}`
							: null
					}
					done={scenes.length > 0}
					disabled={busy}
					onClick={() => xlsxInputRef.current?.click()}
				/>

				<StepButton
					icon={Folder03Icon}
					label="Media folder"
					value={
						mediaFiles.length > 0
							? `${mediaFiles.length} file${mediaFiles.length === 1 ? "" : "s"}${mediaFolderName ? ` · ${mediaFolderName}` : ""}`
							: null
					}
					done={mediaFiles.length > 0}
					disabled={busy || scenes.length === 0}
					onClick={openMediaPicker}
				/>

				{parseWarnings.length > 0 && <WarningBox warnings={parseWarnings} />}

				{scenes.length > 0 && mediaFiles.length > 0 && (
					<div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-2">
						<span className="text-muted-foreground text-xs">Image motion</span>
						<Select
							value={presetId}
							onValueChange={(v) => setPresetId(v as MotionPresetId)}
							disabled={busy}
						>
							<SelectTrigger size="sm" className="w-40">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{MOTION_PRESETS.map((preset) => (
									<SelectItem key={preset.id} value={preset.id}>
										{preset.id === "none" ? "No motion" : preset.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{isExporting && (
					<Progress value={Math.round(exportProgress)} className="h-1.5" />
				)}

				{matches.length > 0 ? (
					<div className="flex flex-col gap-1.5">
						<div className="text-muted-foreground flex items-center justify-between text-[11px]">
							<span>
								{matchedSceneCount} of {matches.length} scenes have media
							</span>
							<span>{readyCount} selected</span>
						</div>
						{matches.map((match) => (
							<SceneRow
								key={match.scene.rowNumber}
								match={match}
								selectedKey={selectedKeyFor(match)}
								disabled={busy}
								onSelect={(key) =>
									setSelections((prev) => ({
										...prev,
										[match.scene.rowNumber]: key,
									}))
								}
							/>
						))}
					</div>
				) : (
					<EmptyState hasScenes={scenes.length > 0} />
				)}
			</PanelView>
		</>
	);
}

function StepButton({
	icon,
	label,
	value,
	done,
	disabled,
	onClick,
}: {
	icon: typeof Film01Icon;
	label: string;
	value: string | null;
	done: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors",
				"hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50",
				done && "border-primary/40 bg-primary/5",
			)}
		>
			<HugeiconsIcon
				icon={done ? CheckmarkCircle02Icon : icon}
				className={cn("size-5 shrink-0", done && "text-primary")}
			/>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{label}</div>
				<div className="text-muted-foreground truncate text-xs">
					{value ?? "Click to select"}
				</div>
			</div>
			<HugeiconsIcon
				icon={CloudUploadIcon}
				className="text-muted-foreground size-4 shrink-0"
			/>
		</button>
	);
}

function SceneRow({
	match,
	selectedKey,
	disabled,
	onSelect,
}: {
	match: SceneMatch;
	selectedKey: string;
	disabled?: boolean;
	onSelect: (key: string) => void;
}) {
	const { scene, candidates } = match;
	const hasCandidates = candidates.length > 0;

	return (
		<div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-sm font-medium">{scene.scene}</span>
					<span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
						{formatClock(scene.startSeconds)}–{formatClock(scene.endSeconds)}
					</span>
				</div>
				{scene.text && (
					<div className="text-muted-foreground truncate text-xs">
						{scene.text}
					</div>
				)}
			</div>

			{hasCandidates ? (
				<Select
					value={selectedKey}
					onValueChange={onSelect}
					disabled={disabled}
				>
					<SelectTrigger size="sm" variant="outline" className="w-36 shrink-0">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NONE}>Skip</SelectItem>
						{candidates.map((media) => (
							<SelectItem key={media.key} value={media.key}>
								{media.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : (
				<span className="text-muted-foreground/70 shrink-0 text-xs italic">
					no media
				</span>
			)}
		</div>
	);
}

function WarningBox({ warnings }: { warnings: string[] }) {
	return (
		<div className="border-amber-500/30 bg-amber-500/5 flex flex-col gap-1 rounded-md border px-2.5 py-2">
			<div className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5 text-xs font-medium">
				<HugeiconsIcon icon={Alert02Icon} className="size-3.5" />
				{warnings.length} row{warnings.length === 1 ? "" : "s"} skipped
			</div>
			<ul className="text-muted-foreground max-h-24 overflow-y-auto text-[11px] leading-relaxed">
				{warnings.map((warning) => (
					<li key={warning}>{warning}</li>
				))}
			</ul>
		</div>
	);
}

function EmptyState({ hasScenes }: { hasScenes: boolean }) {
	return (
		<div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-10 text-center">
			<HugeiconsIcon icon={Film01Icon} className="size-8 opacity-40" />
			<p className="text-xs">
				{hasScenes
					? "Now select the folder with your scene media."
					: "Select a transcription spreadsheet to begin."}
			</p>
		</div>
	);
}
