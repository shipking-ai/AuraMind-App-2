import React, { useState, useRef, useEffect } from "react";
import { useAppPreference } from "../../lib/appPreferences";
import {
  MusicIcon as Music,
  Volume2Icon as Volume2,
  VolumeXIcon as VolumeX,
  SkipForwardIcon as SkipForward,
  SkipBackIcon as SkipBack,
  PlayIcon as Play,
  PauseIcon as Pause,
  Minimize2Icon as Minimize2,
  ListIcon as List,
  ShuffleIcon as Shuffle,
  PlusIcon as Plus,
  XIcon as X,
} from "../icons/CustomIcons";

interface Track {
  id: string;
  title: string;
  url: string;
  assetPath?: string;
  type: string;
  duration?: string;
}

const audioLoaders = import.meta.glob("../assets/audio/*.{mp3,wav,ogg,m4a}", {
  import: "default",
}) as Record<string, () => Promise<string>>;

const AURAMIND_TRACK_METADATA: Record<string, { title: string; type: string }> = {
  "nursery lo-fi.mp3": { title: "Aura Drift", type: "Lo-Fi Focus" },
  "save your soul.mp3": { title: "Soul Sync", type: "Ambient Focus" },
  "that look.mp3": { title: "Mind Gaze", type: "Study Groove" },
  "untitled.mp3": { title: "Neural Bloom", type: "Deep Focus" },
  "sample-3s.mp3": { title: "Focus Pulse", type: "Focus" },
  "sample-6s.mp3": { title: "Aura Flow", type: "Ambient" },
  "sample-9s.mp3": { title: "Memory Loop", type: "Lo-Fi" },
  "sample-12s.mp3": { title: "Recall Wave", type: "Instrumental" },
  "sample-15s.mp3": { title: "Study Current", type: "Focus" },
};

const formatTrackName = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const inferTrackType = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  if (normalized.includes("lofi") || normalized.includes("lo-fi")) return "Lo-Fi";
  if (normalized.includes("rain") || normalized.includes("ocean") || normalized.includes("forest"))
    return "Nature";
  if (normalized.includes("piano")) return "Piano";
  if (normalized.includes("focus")) return "Focus";
  return "Uploaded";
};

const DEFAULT_TRACKS: Track[] = Object.keys(audioLoaders)
  .sort((a, b) => a.localeCompare(b))
  .map((path, index) => {
    const fileName = path.split("/").pop() || `track-${index + 1}`;
    const metadata = AURAMIND_TRACK_METADATA[fileName.toLowerCase()];
    return {
      id: `${index + 1}`,
      title: metadata?.title || formatTrackName(fileName),
      url: "",
      assetPath: path,
      type: metadata?.type || inferTrackType(fileName),
    };
  });

const resolveTrackUrl = async (track: Track): Promise<string> => {
  if (track.url) return track.url;
  if (!track.assetPath) return "";
  const loader = audioLoaders[track.assetPath];
  if (!loader) return "";
  return loader();
};

const AmbientPlayer: React.FC = () => {
  const [playlist, setPlaylist] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useAppPreference("bonamind_studyMusicVolume", "50");
  const [volume, setVolume] = useState(() => {
    const parsed = Number(musicVolume);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed / 100)) : 0.5;
  });
  const [isMinimized, setIsMinimized] = useState(true);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [customUrl, setCustomUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [trackErrorIds, setTrackErrorIds] = useState<string[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const parsed = Number(musicVolume);
    if (Number.isFinite(parsed)) {
      setVolume(Math.min(1, Math.max(0, parsed / 100)));
    }
  }, [musicVolume]);

  const updateVolume = (next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    setVolume(clamped);
    setMusicVolume(String(Math.round(clamped * 100)));
  };

  useEffect(() => {
    let cancelled = false;
    const track = playlist[currentTrackIndex];
    if (!track || track.url || !track.assetPath) return;

    resolveTrackUrl(track).then((url) => {
      if (cancelled || !url) return;
      setPlaylist((prev) =>
        prev.map((item, idx) => (idx === currentTrackIndex ? { ...item, url } : item)),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [currentTrackIndex, playlist]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const trackUrl = playlist[currentTrackIndex]?.url;
    if (isPlaying && trackUrl) {
      audio.play().catch((e) => {
        console.error("Audio play failed", e);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrackIndex, playlist]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const nextTrack = () => {
    if (playlist.length <= 1) return;
    if (isShuffle) {
      const nextIndex = Math.floor(Math.random() * playlist.length);
      setCurrentTrackIndex(nextIndex);
    } else {
      setCurrentTrackIndex((prev) => (prev + 1) % playlist.length);
    }
  };

  const prevTrack = () => {
    if (playlist.length <= 1) return;
    setCurrentTrackIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
  };

  const handleTrackError = () => {
    const failedTrack = playlist[currentTrackIndex];
    if (!failedTrack) return;

    setTrackErrorIds((prev) => {
      if (prev.includes(failedTrack.id)) return prev;
      return [...prev, failedTrack.id];
    });

    if (playlist.length <= 1) {
      setIsPlaying(false);
      return;
    }

    const nextIndex = playlist.findIndex(
      (track, idx) =>
        idx !== currentTrackIndex &&
        track.id !== failedTrack.id &&
        !trackErrorIds.includes(track.id),
    );
    if (nextIndex >= 0) {
      setCurrentTrackIndex(nextIndex);
      setIsPlaying(true);
      return;
    }

    setIsPlaying(false);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const addCustomTrack = () => {
    if (!customUrl.trim()) return;

    const newTrack: Track = {
      id: Date.now().toString(),
      title: "Custom Track",
      url: customUrl,
      type: "Custom",
    };

    setPlaylist([...playlist, newTrack]);
    setCustomUrl("");
    setShowUrlInput(false);

    // Automatically switch to new track
    setCurrentTrackIndex(playlist.length);
    setIsPlaying(true);
  };

  const currentTrack = playlist[currentTrackIndex];
  const hasTrackError = currentTrack ? trackErrorIds.includes(currentTrack.id) : false;

  if (!currentTrack) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${isMinimized ? "w-auto" : "w-80"}`}
    >
      <audio
        ref={audioRef}
        src={currentTrack.url || undefined}
        preload="none"
        loop={false}
        onEnded={nextTrack}
        onTimeUpdate={handleTimeUpdate}
        onError={handleTrackError}
      />

      <div className="bg-black/60 backdrop-blur-xl border border-black/ dark:border-white/ rounded-3xl shadow-2xl overflow-hidden accent-gradient-border ring-1 ring-white/5">
        {/* Minimized View */}
        {isMinimized ? (
          <button
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-4 p-3 pr-6 hover:bg-black/5 bg-zinc-900/5 transition-colors group"
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${isPlaying ? "accent-gradient shadow-[0_0_15px_rgba(168,85,247,0.4)] animate-spin-slow" : "bg-zinc-900/5"}`}
            >
              <Music size={18} className="text-slate-900 dark:text-white" />
            </div>

            {isPlaying && (
              <div className="flex flex-col items-start mr-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white max-w-[100px] truncate">
                  {currentTrack.title}
                </span>
                <span className="text-[10px] text-purple-300">{currentTrack.type}</span>
              </div>
            )}

            {!isPlaying && (
              <span className="text-sm font-medium text-black/ dark:text-white/ group-hover:text-slate-900 dark:text-white">
                Music
              </span>
            )}
          </button>
        ) : (
          /* Maximized View */
          <div className="flex flex-col h-[450px]">
            {/* Header */}
            <div className="p-5 flex justify-between items-center bg-gradient-to-b from-white/5 to-transparent">
              <button
                onClick={() => setShowPlaylist(!showPlaylist)}
                className={`p-2 rounded-full transition-colors ${showPlaylist ? "bg-zinc-900/10 text-zinc-100" : "text-black/ dark:text-white/ hover:text-slate-900 dark:text-white"}`}
              >
                <List size={18} />
              </button>
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-black/ dark:text-white/">
                Now Playing
              </span>
              <button
                onClick={() => setIsMinimized(true)}
                className="p-2 rounded-full text-black/ dark:text-white/ hover:text-slate-900 dark:text-white hover:bg-zinc-900/10 transition-colors"
              >
                <Minimize2 size={18} />
              </button>
            </div>

            {/* Playlist View or Player View */}
            {showPlaylist ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                <button
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="w-full py-3 px-4 rounded-xl border border-dashed border-zinc-700/30 text-zinc-300 hover:border-zinc-700/50 hover:bg-zinc-900/10 transition-all flex items-center justify-center gap-2 text-sm font-medium mb-4"
                >
                  <Plus size={16} /> Add Custom URL
                </button>

                {showUrlInput && (
                  <div className="mb-4 bg-zinc-900/10 p-3 rounded-xl space-y-2">
                    <input
                      type="text"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      placeholder="Paste MP3 URL..."
                      className="w-full bg-black/50 border border-black/ dark:border-white/ rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={addCustomTrack}
                        className="flex-1 bg-purple-600 hover:bg-purple-500 text-slate-900 dark:text-white text-xs font-bold py-2 rounded-lg transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setShowUrlInput(false)}
                        className="px-3 bg-zinc-900/10 hover:bg-zinc-900/10 text-slate-900 dark:text-white text-xs font-bold rounded-lg transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {playlist.map((track, idx) => (
                  <div
                    key={track.id}
                    onClick={() => {
                      setCurrentTrackIndex(idx);
                      setIsPlaying(true);
                    }}
                    className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all group ${currentTrackIndex === idx ? "bg-zinc-900/20 shadow-lg" : "hover:bg-zinc-900/10"}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${currentTrackIndex === idx ? "accent-gradient text-slate-900 dark:text-white" : "bg-zinc-900/10 text-zinc-400 group-hover:text-white"}`}
                    >
                      {currentTrackIndex === idx && isPlaying ? (
                        <div className="flex gap-[2px] items-end h-3">
                          <div className="w-[2px] bg-primary animate-music-bar h-full"></div>
                          <div
                            className="w-[2px] bg-primary animate-music-bar h-2/3"
                            style={{ animationDelay: "0.1s" }}
                          ></div>
                          <div
                            className="w-[2px] bg-primary animate-music-bar h-1/2"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                        </div>
                      ) : (
                        <span className="text-xs font-bold">{idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-bold truncate ${currentTrackIndex === idx ? "text-slate-900 dark:text-white" : "text-neutral-400 group-hover:text-neutral-200"}`}
                      >
                        {track.title}
                      </h4>
                      <p className="text-[10px] text-neutral-600 uppercase tracking-wider">
                        {track.type}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Player View
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div
                  className={`w-32 h-32 rounded-full mb-6 relative flex items-center justify-center shadow-[0_0_40px_rgba(124,58,237,0.2)] transition-all duration-700 ${isPlaying ? "scale-100" : "scale-90 opacity-80"}`}
                >
                  <div
                    className={`absolute inset-0 rounded-full accent-gradient opacity-20 ${isPlaying ? "animate-pulse" : ""}`}
                  ></div>
                  <div className="w-full h-full rounded-full bg-gradient-to-br from-gray-900 to-black border border-black/ dark:border-white/ flex items-center justify-center overflow-hidden">
                    <Music
                      size={40}
                      className={`text-black/ dark:text-white/ ${isPlaying ? "animate-bounce-subtle" : ""}`}
                    />
                  </div>
                  {/* Rotating Border */}
                  {isPlaying && (
                    <div className="absolute inset-[-4px] rounded-full border-t border-purple-500/50 animate-spin-slow pointer-events-none"></div>
                  )}
                </div>

                <div className="space-y-1 mb-8 w-full">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate px-4">
                    {currentTrack.title}
                  </h3>
                  <p className="text-sm text-purple-300 font-medium">{currentTrack.type}</p>
                  {hasTrackError && (
                    <p className="text-xs text-red-300">
                      This track could not be loaded. Skipping to the next available track.
                    </p>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="w-full space-y-2 mb-6 group">
                  <div className="relative h-1 bg-zinc-900/10 rounded-full overflow-hidden cursor-pointer">
                    <div
                      className="absolute top-0 left-0 h-full accent-gradient"
                      style={{ width: `${(progress / duration) * 100}%` }}
                    />
                    <input
                      type="range"
                      min="0"
                      max={duration || 100}
                      value={progress}
                      onChange={handleSeek}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-medium text-black/ dark:text-white/ px-1">
                    <span>{formatTime(progress)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Main Controls */}
                <div className="flex items-center justify-center gap-6 w-full">
                  <button
                    onClick={() => setIsShuffle(!isShuffle)}
                    className={`text-black/ dark:text-white/ hover:text-slate-900 dark:text-white transition-colors ${isShuffle ? "text-purple-400" : ""}`}
                  >
                    <Shuffle size={18} />
                  </button>

                  <button
                    onClick={prevTrack}
                    className="text-slate-900 dark:text-white hover:text-purple-300 transition-colors"
                  >
                    <SkipBack size={24} />
                  </button>

                  <button
                    onClick={togglePlay}
                    className="w-14 h-14 flex items-center justify-center rounded-full accent-gradient text-slate-900 dark:text-white shadow-lg hover:brightness-110 active:scale-95 transition-all"
                  >
                    {isPlaying ? (
                      <Pause size={28} fill="currentColor" />
                    ) : (
                      <Play size={28} fill="currentColor" className="ml-1" />
                    )}
                  </button>

                  <button
                    onClick={nextTrack}
                    className="text-slate-900 dark:text-white hover:text-purple-300 transition-colors"
                  >
                    <SkipForward size={24} />
                  </button>

                  <button
                    className="text-black/ dark:text-white/ hover:text-slate-900 dark:text-white transition-colors relative group/vol"
                    onClick={() => updateVolume(volume === 0 ? 0.5 : 0)}
                  >
                    {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* Volume Footer (only in playlist view or extra control) */}
            <div className="px-6 pb-6 pt-2">
              {/* Could add mini volume slider here if needed, but the button toggle above might be cleaner for now to save space */}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AmbientPlayer;
