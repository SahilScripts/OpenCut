"use client";

import {
	Alert02Icon,
	CheckmarkCircle02Icon,
	CloudUploadIcon,
	DocumentAttachmentIcon,
	Film01Icon,
	Folder03Icon,
	GridViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
	listFolders,
	matchMediaToScenes,
} from "@/lib/scene-builder/match-media";
import {
	MOTION_PRESETS,
	type MotionPresetId,
} from "@/lib/scene-builder/motion";
import { parseTranscriptionFile } from "@/lib/scene-builder/parse-xlsx";
import { formatClock } from "@/lib/scene-builder/timestamp";
import type { SceneMatch, SceneMediaFile } from "@/lib/scene-builder/types";
import { cn } from "@/utils/ui";

/** Sentinel value meaning "place nothing for this scene". */
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

	// scene.rowNumber -> chosen media key (or NONE). Absent => default.
	const [selections, setSelections] = useState<Record<number, string>>({});
	const [presetId, setPresetId] = useState<MotionPresetId>("none");

	const [pickerOpen, setPickerOpen] = useState(false);
	const [isParsing, setIsParsing] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [exportProgress, setExportProgress] = useState(0);

	const matches = useMemo(
		() => matchMediaToScenes(scenes, mediaFiles),
		[scenes, mediaFiles],
	);
	const folders = useMemo(() => listFolders(mediaFiles), [mediaFiles]);

	// Preview URLs for image candidates, rebuilt whenever the media set changes.
	const [thumbs, setThumbs] = useState<Record<string, string>>({});
	useEffect(() => {
		const urls: Record<string, string> = {};
		for (const media of mediaFiles) {
			if (media.kind === "image") {
				urls[media.key] = URL.createObjectURL(media.file);
			}
		}
		setThumbs(urls);
		return () => {
			for (const url of Object.values(urls)) URL.revokeObjectURL(url);
		};
	}, [mediaFiles]);

	/**
	 * The effective media key for a scene: an explicit choice when present,
	 * otherwise the lone candidate auto-selected (so single-option scenes need
	 * no click), otherwise NONE so the user picks the best one deliberately.
	 */
	const selectedKeyFor = (match: SceneMatch): string => {
		const explicit = selections[match.scene.rowNumber];
		if (explicit !== undefined) return explicit;
		return match.candidates.length === 1 ? match.candidates[0].key : NONE;
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

	function toggleSelect(match: SceneMatch, key: string) {
		const next = selectedKeyFor(match) === key ? NONE : key;
		setSelections((prev) => ({ ...prev, [match.scene.rowNumber]: next }));
	}

	/** Select the given folder's image for every scene that has one. */
	function selectFolderForAll(folder: string) {
		setSelections((prev) => {
			const next = { ...prev };
			for (const match of matches) {
				const candidate = match.candidates.find((c) => c.folder === folder);
				if (candidate) next[match.scene.rowNumber] = candidate.key;
			}
			return next;
		});
	}

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

		// Derive the parent-folder label from the first file's relative path.
		const relPath = (files[0] as File & { webkitRelativePath?: string })
			.webkitRelativePath;
		setMediaFolderName(
			relPath ? relPath.split("/")[0] : `${files.length} files`,
		);

		if (built.length === 0) {
			toast.error("No supported images or videos in that folder");
			return;
		}
		// Jump straight into the picker once media is loaded.
		setPickerOpen(true);
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
			toast.error("Pick an image for at least one scene first");
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
				setPickerOpen(false);
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
						disabled={busy || matchedSceneCount === 0}
						onClick={() => setPickerOpen(true)}
						className="gap-1.5"
					>
						<HugeiconsIcon icon={GridViewIcon} />
						Select images
					</Button>
				}
				className="select-none"
				contentClassName="flex flex-col gap-3 pb-4"
			>
				<p className="text-muted-foreground text-xs leading-relaxed">
					Turn a transcription spreadsheet into a timeline. Pick a parent folder
					whose subfolders each hold one image per scene (named{" "}
					<code className="text-foreground">scene1</code>,{" "}
					<code className="text-foreground">scene2</code>, …); then choose the
					best image for each scene.
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
							? `${mediaFiles.length} image${mediaFiles.length === 1 ? "" : "s"} · ${folders.length} folder${folders.length === 1 ? "" : "s"}${mediaFolderName ? ` · ${mediaFolderName}` : ""}`
							: null
					}
					done={mediaFiles.length > 0}
					disabled={busy || scenes.length === 0}
					onClick={openMediaPicker}
				/>

				{parseWarnings.length > 0 && <WarningBox warnings={parseWarnings} />}

				{matches.length > 0 && matchedSceneCount > 0 ? (
					<div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
						<div className="text-muted-foreground flex items-center justify-between text-xs">
							<span>
								{matchedSceneCount} of {matches.length} scenes have media
							</span>
							<span>{readyCount} selected</span>
						</div>
						<Button
							variant="outline"
							size="sm"
							disabled={busy}
							onClick={() => setPickerOpen(true)}
							className="gap-1.5"
						>
							<HugeiconsIcon icon={GridViewIcon} />
							Open image picker
						</Button>
					</div>
				) : (
					<EmptyState hasScenes={scenes.length > 0} />
				)}
			</PanelView>

			<ScenePickerDialog
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				matches={matches}
				folders={folders}
				thumbs={thumbs}
				selectedKeyFor={selectedKeyFor}
				onToggle={toggleSelect}
				onSelectFolderForAll={selectFolderForAll}
				readyCount={readyCount}
				matchedSceneCount={matchedSceneCount}
				presetId={presetId}
				onPresetChange={setPresetId}
				busy={busy}
				isExporting={isExporting}
				exportProgress={exportProgress}
				onExport={handleExport}
			/>
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

function ScenePickerDialog({
	open,
	onOpenChange,
	matches,
	folders,
	thumbs,
	selectedKeyFor,
	onToggle,
	onSelectFolderForAll,
	readyCount,
	matchedSceneCount,
	presetId,
	onPresetChange,
	busy,
	isExporting,
	exportProgress,
	onExport,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	matches: SceneMatch[];
	folders: string[];
	thumbs: Record<string, string>;
	selectedKeyFor: (match: SceneMatch) => string;
	onToggle: (match: SceneMatch, key: string) => void;
	onSelectFolderForAll: (folder: string) => void;
	readyCount: number;
	matchedSceneCount: number;
	presetId: MotionPresetId;
	onPresetChange: (id: MotionPresetId) => void;
	busy: boolean;
	isExporting: boolean;
	exportProgress: number;
	onExport: () => void;
}) {
	// Sticky scene column + one fixed-width column per variant folder.
	const gridTemplateColumns = `minmax(220px, 1.4fr) repeat(${folders.length}, 168px)`;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[88vh] w-[calc(100%-2rem)] max-w-[min(96vw,1100px)] select-none flex-col gap-0 overflow-hidden p-0">
				<DialogHeader>
					<DialogTitle>Select scene images</DialogTitle>
					<DialogDescription>
						Pick the best image for each scene. {matchedSceneCount} of{" "}
						{matches.length} scenes have media across {folders.length} folder
						{folders.length === 1 ? "" : "s"}.
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 flex-1 overflow-auto">
					<div className="min-w-max">
						{/* Header row */}
						<div
							className="bg-popover sticky top-0 z-20 grid border-b"
							style={{ gridTemplateColumns }}
						>
							<div className="bg-popover text-muted-foreground sticky left-0 z-30 border-r px-3 py-2 text-xs font-medium">
								Scene
							</div>
							{folders.map((folder) => (
								<div
									key={folder || "__root__"}
									className="flex flex-col items-center gap-0.5 px-2 py-2 text-center"
								>
									<span className="flex max-w-full items-center gap-1 text-xs font-medium">
										<HugeiconsIcon
											icon={Folder03Icon}
											className="text-muted-foreground size-3.5 shrink-0"
										/>
										<span className="truncate">{folder || "Files"}</span>
									</span>
									<button
										type="button"
										disabled={busy}
										onClick={() => onSelectFolderForAll(folder)}
										className="text-primary text-[10px] hover:underline disabled:opacity-50"
									>
										Use all
									</button>
								</div>
							))}
						</div>

						{/* One row per scene */}
						{matches.map((match) => {
							const selectedKey = selectedKeyFor(match);
							return (
								<div
									key={match.scene.rowNumber}
									className="grid border-b last:border-b-0"
									style={{ gridTemplateColumns }}
								>
									<div className="bg-popover sticky left-0 z-10 flex flex-col gap-0.5 border-r px-3 py-2">
										<span className="truncate text-sm font-medium">
											{match.scene.scene}
										</span>
										<span className="text-muted-foreground text-[11px] tabular-nums">
											{formatClock(match.scene.startSeconds)}–
											{formatClock(match.scene.endSeconds)}
										</span>
										{match.scene.text && (
											<span className="text-muted-foreground line-clamp-2 text-xs">
												{match.scene.text}
											</span>
										)}
									</div>

									{folders.map((folder) => {
										const candidates = match.candidates.filter(
											(c) => c.folder === folder,
										);
										return (
											<div
												key={folder || "__root__"}
												className="flex flex-wrap items-center justify-center gap-1.5 p-2"
											>
												{candidates.length > 0 ? (
													candidates.map((media) => (
														<Thumb
															key={media.key}
															media={media}
															thumbUrl={thumbs[media.key]}
															selected={selectedKey === media.key}
															disabled={busy}
															onClick={() => onToggle(match, media.key)}
														/>
													))
												) : (
													<span className="text-muted-foreground/50 text-xs">
														—
													</span>
												)}
											</div>
										);
									})}
								</div>
							);
						})}
					</div>
				</div>

				{isExporting && (
					<Progress
						value={Math.round(exportProgress)}
						className="h-1 rounded-none"
					/>
				)}

				<DialogFooter className="items-center sm:justify-between">
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground text-xs">Image motion</span>
						<Select
							value={presetId}
							onValueChange={(v) => onPresetChange(v as MotionPresetId)}
							disabled={busy}
						>
							<SelectTrigger size="sm" className="w-36">
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
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground text-xs">
							{readyCount} selected
						</span>
						<DialogClose asChild>
							<Button variant="outline" size="sm" disabled={isExporting}>
								Close
							</Button>
						</DialogClose>
						<Button
							size="sm"
							disabled={busy || readyCount === 0}
							onClick={onExport}
							className="gap-1.5"
						>
							<HugeiconsIcon icon={Film01Icon} />
							{isExporting ? "Building…" : `Add ${readyCount} to timeline`}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function Thumb({
	media,
	thumbUrl,
	selected,
	disabled,
	onClick,
}: {
	media: SceneMediaFile;
	thumbUrl: string | undefined;
	selected: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			title={media.name}
			className={cn(
				"relative aspect-video w-full overflow-hidden rounded-md border bg-muted/40 transition",
				"disabled:pointer-events-none disabled:opacity-50",
				selected
					? "ring-primary border-primary ring-2"
					: "hover:border-foreground/40",
			)}
		>
			{thumbUrl ? (
				<Image
					src={thumbUrl}
					alt={media.name}
					fill
					sizes="168px"
					className="object-cover"
					loading="lazy"
					unoptimized
				/>
			) : (
				<span className="flex size-full items-center justify-center">
					<HugeiconsIcon
						icon={Film01Icon}
						className="text-muted-foreground size-5"
					/>
				</span>
			)}
			{selected && (
				<span className="bg-primary text-primary-foreground absolute right-1 top-1 flex size-4 items-center justify-center rounded-full">
					<HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
				</span>
			)}
		</button>
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
					? "Now select the parent folder with your scene media."
					: "Select a transcription spreadsheet to begin."}
			</p>
		</div>
	);
}
