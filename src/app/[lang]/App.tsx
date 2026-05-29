import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Visualizer } from "../../components/Visualizer";
import { FloatingControls } from "../../components/FloatingControls";
import { LeftDrawer } from "../../components/LeftDrawer";
import { RightDrawer } from "../../components/RightDrawer";
import { useAudioPlayer } from "../../hooks/useAudio";
import { useI18n } from "./i18nContext";
import { useUISettings } from "./UISettingsContext";
import { AudioFile, RenderTask, VisualizerSettings } from "../../types";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { runVideoRender } from "../../utils/videoRenderer";
import { PopOutButton } from "../../components/PopOutButton";
import { PlaybackControls } from "../../components/PlaybackControls";
import { AudioLines, Settings } from "lucide-react";
import { MyDialog } from "../../components/MyDialog";

const DEFAULT_SETTINGS: VisualizerSettings = {
  barCount: 64,
  barWidth: 4,
  barHeightMultiplier: 1.0,
  cornerRadius: 4,
  totalWidth: 800,
  spacing: 800 / 64,
  color: "#ffffff",
  backgroundColor: "#000000",
  positiveHeightScale: 1.0,
  negativeHeightScale: 0.5,
  positiveColor: "#ffffff",
  negativeColor: "#2a2a2a",
  contrast: 1.0,
  attack: 0.26,
  decay: 0.93,
  yOffset: -30,
  renderFps: 60,
  encoder: "webcodecs-hw",
  softCeilingThreshold: 0.9,
  softCeilingStrength: 0.5,
  referenceFps: 144,
  minFreq: 20,
  maxFreq: 16000,
  enableGreenScreen: false,
  enableTransparentBg: false,
  exportFormat: "mp4",
};
export { DEFAULT_SETTINGS };

const RENDER_FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;

export default function App() {
  const { locale: lang, t: dict, switchLocale } = useI18n();
  const {
    uiOpacity,
    enableBlur,
    updateSetting: setUISettings,
  } = useUISettings();
  const [isTransparentUI, setIsTransparentUI] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const [files, setFiles] = useState<AudioFile[]>([]);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [settings, setSettings] =
    useState<VisualizerSettings>(DEFAULT_SETTINGS);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFloatVis, setFloatVis] = useState(false);
  const {
    isPlaying,
    loadAudio,
    togglePlay,
    seek,
    currentTime,
    duration,
    analyser,
    audioBuffer,
    volume,
    setVolume,
  } = useAudioPlayer(files, currentFileIndex);

  const [queue, setQueue] = useState<RenderTask[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const currentTaskIdRef = useRef<string | null>(null);
  const activeWorkerRef = useRef<Worker | null>(null);
  const prevVolumeRef = useRef(1);
  const [isSettingOpen, setIsSettingsOpen] = useState(false);
  const [vp9Support, setVp9Support] = useState<
    { hardware: boolean; software: boolean } | undefined
  >();

  useEffect(() => {
    import("../../utils/platform").then(({ checkVp9AlphaSupport }) =>
      checkVp9AlphaSupport().then(setVp9Support),
    );
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        if (!ffmpegRef.current) {
          ffmpegRef.current = new FFmpeg();
        }
        const ffmpeg = ffmpegRef.current;
        ffmpeg.on("log", ({ message }) => console.log("[FFmpeg]", message));

        ffmpeg.on("progress", ({ progress }) => {
          const taskId = currentTaskIdRef.current;
          if (taskId) {
            const p = Math.round(progress * 100);
            setQueue((prev) =>
              prev.map((t) => {
                if (t.id !== taskId) return t;
                const stage = "mixing";
                return {
                  ...t,
                  progress: p,
                  stageProgress: { ...t.stageProgress, [stage]: p },
                };
              }),
            );
          }
        });

        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript",
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm",
          ),
        });
        setFfmpegLoaded(true);
      } catch (err) {
        console.error("FFmpeg load failed", err);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // alert when queue
      if (queue.length > 0 || files.length > 0) {
        e.preventDefault();
        // routine, set returnValue
        e.returnValue = "工作進度不被保存";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [queue.length, files.length]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const buffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buffer);
    const duration = audioBuffer.duration;
    ctx.close();

    const newFile: AudioFile = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      duration,
      url: URL.createObjectURL(file),
    };

    setFiles((prev) => [newFile, ...prev]);
    if (!currentFileId) {
      handleSelectFile(newFile);
    }
  };

  const handleSelectFile = async (file: AudioFile) => {
    const idx = files.findIndex((f) => f.id === file.id);
    setCurrentFileId(file.id);
    setCurrentFileIndex(idx >= 0 ? idx : currentFileIndex);
    await loadAudio(file.file);
  };

  const handleDeleteFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (currentFileId === id) {
      setCurrentFileId(null);
      setCurrentFileIndex(-1);
    }
  };

  const handleToggleMute = () => {
    console.log(prevVolumeRef.current);
    if (isMuted) {
      // 取消靜音：恢復之前的音量
      setVolume(prevVolumeRef.current);
      setIsMuted(false);
    } else {
      // 只有當目前音量 > 0 時才記錄（避免覆蓋掉正確的 prevVolume）
      if (volume > 0) {
        prevVolumeRef.current = volume;
      }
      setVolume(0);
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    if (vol > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handlePrev = () => {
    if (files.length === 0) return undefined;
    let idx: number;
    if (currentFileIndex <= 0) {
      idx = files.length - 1;
      handleSelectFile(files[files.length - 1]);
    } else {
      idx = currentFileIndex - 1;
      handleSelectFile(files[currentFileIndex - 1]);
    }
    setCurrentFileIndex(idx);
    return idx;
  };

  const handleNext = () => {
    if (files.length === 0) return undefined;
    let idx: number;
    if (currentFileIndex >= files.length - 1) {
      idx = 0;
      handleSelectFile(files[0]);
    } else {
      idx = currentFileIndex + 1;
      handleSelectFile(files[currentFileIndex + 1]);
    }
    setCurrentFileIndex(idx);
    return idx;
  };

  const handleAddToQueue = () => {
    if (!currentFileId) return;
    const file = files.find((f) => f.id === currentFileId);
    if (!file) return;

    const task: RenderTask = {
      id: crypto.randomUUID(),
      fileId: file.id,
      fileName: file.name,
      settings: { ...settings },
      status: "idle",
      progress: 0,
      stageProgress: {
        rendering: 0,
        mixing: 0,
      },
      stageTimestamps: {},
      createdAt: Date.now(),
    };

    setQueue((prev) => [...prev, task]);
    setRightOpen(true);
  };

  useEffect(() => {
    const processNext = async () => {
      if (isProcessing || !ffmpegLoaded) return;

      const nextTask = queue.find((t) => t.status === "idle");
      if (!nextTask) return;

      const fileObj = files.find((f) => f.id === nextTask.fileId);
      if (!fileObj) {
        setQueue((prev) =>
          prev.map((t) =>
            t.id === nextTask.id
              ? { ...t, status: "error", error: "File not found" }
              : t,
          ),
        );
        return;
      }

      setIsProcessing(true);

      try {
        await runRender(nextTask, fileObj.file);
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((t) =>
            t.id === nextTask.id
              ? { ...t, status: "error", error: err.message }
              : t,
          ),
        );
      } finally {
        setIsProcessing(false);
      }
    };

    processNext();
  }, [queue, isProcessing, ffmpegLoaded, files]);

  const updateTask = (id: string, updates: Partial<RenderTask>) => {
    setQueue((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    );
  };

  const runRender = async (task: RenderTask, file: File) => {
    if (!ffmpegRef.current) {
      throw new Error("FFmpeg is not loaded");
    }
    const ffmpeg = ffmpegRef.current;
    currentTaskIdRef.current = task.id;

    try {
      const { url: resultUrl, format: resultFormat } = await runVideoRender(
        task,
        file,
        ffmpeg,
        (updates: any) => {
          const taskId = task.id;
          setQueue((prev) =>
            prev.map((t) => {
              if (t.id !== taskId) return t;
              const next = { ...t, ...updates };
              if (updates.stageProgress) {
                next.stageProgress = {
                  ...t.stageProgress,
                  ...updates.stageProgress,
                };
              }
              if (updates.stageTimestamp) {
                const stage = updates.stageTimestamp
                  .stage as keyof typeof t.stageTimestamps;
                const type = updates.stageTimestamp.type as "start" | "end";
                const now = Date.now();
                const currentTimestamps = { ...t.stageTimestamps };
                if (type === "start") {
                  currentTimestamps[stage] = { start: now };
                } else if (type === "end" && currentTimestamps[stage]) {
                  currentTimestamps[stage] = {
                    ...currentTimestamps[stage],
                    end: now,
                  };
                }
                next.stageTimestamps = currentTimestamps;
              }
              return next;
            }),
          );
        },
      );
      updateTask(task.id, {
        status: "done",
        progress: 100,
        resultUrl,
        resultFormat,
      });
    } catch (error: any) {
      updateTask(task.id, { status: "error", error: error.message });
    } finally {
      currentTaskIdRef.current = null;
    }
  };

  const handleCancelTask = async (taskId: string) => {
    if (currentTaskIdRef.current === taskId) {
      if (activeWorkerRef.current) {
        activeWorkerRef.current.terminate();
        activeWorkerRef.current = null;
      }
      setIsProcessing(false);
      currentTaskIdRef.current = null;
    }

    setQueue((prev) => prev.filter((t) => t.id !== taskId));
  };

  return (
    <div className={`relative w-full h-full overflow-hidden`}>
      <button
        onClick={() => setFloatVis(!isFloatVis)}
        className="absolute top-4 left-1/2 -translate-x-1/2 w-10 h-10 bg-zinc-900 rounded-full flex items-center justify-center border-zinc-700 hover:bg-zinc-800 transition-all-200 z-40                 hover:scale-105
                active:scale-95"
      >
        <AudioLines className="w-6 h-6 bg-transparent" />
      </button>
      <button
        onClick={() => setIsSettingsOpen(!isSettingOpen)}
        className="absolute bottom-4 left-4 w-10 h-10 bg-zinc-900 rounded-full flex items-center justify-center border-zinc-700 hover:bg-zinc-800 transition-all-200 z-40                hover:scale-105
                active:scale-95"
      >
        <Settings className="w-6 h-6 bg-transparent" />
      </button>

      <MyDialog
        isVisible={isSettingOpen}
        handleClose={() => setIsSettingsOpen(false)}
        title="Settings"
      >
        <div className="space-y-8 text-white">
          <div className="space-y-2">
            <div className="text-lg font-medium">
              {lang === "zh" ? "語言" : "Language"}
            </div>
            <select
              value={lang}
              onChange={(e) => {
                const nextLang = e.target.value;
                switchLocale(nextLang);
                const segments = location.pathname.split("/");
                segments[1] = nextLang;
                navigate(segments.join("/"));
              }}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-white focus:outline-none"
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
          <div>
            <span className="text-lg font-medium mr-4">
              {lang === "zh" ? "透明 UI" : "Transparent UI"}
            </span>
            <input
              className="w-5 h-5"
              type="checkbox"
              checked={isTransparentUI}
              onChange={(e) => {
                setIsTransparentUI(e.target.checked);
                if (e.target.checked) {
                  setUISettings("enableBlur", true);
                  setUISettings("uiOpacity", 0.8);
                } else {
                  setUISettings("enableBlur", false);
                  setUISettings("uiOpacity", 0.8);
                }
              }}
            />
          </div>
          <div>
            <span className="text-md">Feedback: </span>
            <a
              className="underline decoration-dashed"
              target="blank"
              href={
                lang === "zh"
                  ? "https://tally.so/r/LZG9Oz"
                  : "https://tally.so/r/obk06M"
              }
            >
              Tally Form
            </a>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-800"
            >
              {lang === "zh" ? "關閉" : "close"}
            </button>
          </div>
        </div>
      </MyDialog>

      <div className="absolute inset-0 z-0">
        <Visualizer
          settings={settings}
          analyser={analyser}
          isPlaying={isPlaying}
        />
      </div>

      <LeftDrawer
        files={files}
        currentFileId={currentFileId}
        onSelect={handleSelectFile}
        onDelete={handleDeleteFile}
        onUpload={handleUpload}
        isOpen={leftOpen}
        setIsOpen={setLeftOpen}
        uiOpacity={uiOpacity}
        enableBlur={enableBlur}
      />

      <RightDrawer
        queue={queue}
        isOpen={rightOpen}
        setIsOpen={setRightOpen}
        onCancel={handleCancelTask}
        uiOpacity={uiOpacity}
        enableBlur={enableBlur}
      />

      <PlaybackControls
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onNext={handleNext}
        onPrev={handlePrev}
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        currentFileName={files.find((f) => f.id === currentFileId)?.name}
      />

      <FloatingControls
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onRender={handleAddToQueue}
        settings={settings}
        onSettingsChange={setSettings}
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
        visible={isFloatVis}
        vp9Support={vp9Support}
      />
    </div>
  );
}
