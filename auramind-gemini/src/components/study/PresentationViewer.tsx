import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PlayIcon as Play, PauseIcon as Pause, ChevronRightIcon as ChevronRight, ChevronLeftIcon as ChevronLeft, Volume2Icon as Volume2, Maximize2Icon as Maximize2, Minimize2Icon as Minimize2, RotateCcwIcon as RotateCcw } from '../icons/CustomIcons';
import type { Slide } from '../../types';
import { isSpeechOutputAvailable, speak as speakAloud, stopSpeaking as stopSpeech } from '../../services/voice/speechOutput';

interface PresentationViewerProps {
    title: string;
    slides: Slide[];
}

const PresentationViewer: React.FC<PresentationViewerProps> = ({ title, slides }) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Narration: native TTS in the Android app, Web Speech elsewhere, in the
    // voice chosen in Settings. The token ignores a finish that belongs to a
    // slide the user has already moved past.
    const speechTokenRef = useRef(0);

    const speak = useCallback((text: string) => {
        if (!isSpeechOutputAvailable()) return;
        const token = ++speechTokenRef.current;
        setIsSpeaking(true);
        void speakAloud(text).then(({ interrupted }) => {
            if (token !== speechTokenRef.current) return;
            setIsSpeaking(false);
            if (interrupted) return;
            if (isPlaying && currentSlide < slides.length - 1) {
                // Auto advance if playing
                setTimeout(() => setCurrentSlide(c => c + 1), 1000);
            } else if (isPlaying && currentSlide === slides.length - 1) {
                setIsPlaying(false);
            }
        });
    }, [isPlaying, currentSlide, slides.length]);

    const stopSpeaking = useCallback(() => {
        speechTokenRef.current += 1;
        stopSpeech();
        setIsSpeaking(false);
    }, []);

    useEffect(() => {
        if (isPlaying) {
            speak(slides[currentSlide].script);
        } else {
            stopSpeaking();
        }

        return () => stopSpeaking();
    }, [currentSlide, isPlaying, speak, stopSpeaking, slides]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const handleNext = () => {
        if (currentSlide < slides.length - 1) {
            setCurrentSlide(c => c + 1);
        }
    };

    const handlePrev = () => {
        if (currentSlide > 0) {
            setCurrentSlide(c => c - 1);
        }
    };

    return (
        <div
            ref={containerRef}
            className={`relative bg-gradient-to-br from-indigo-900 to-purple-900 rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'w-full aspect-[16/9]'
                }`}
        >
            {/* Slide Content */}
            <div className="absolute inset-0 flex flex-col p-8 md:p-12 text-slate-900 dark:text-white">
                <div className="flex-1 flex flex-col justify-center">
                    <h2 className="text-3xl md:text-5xl font-bold mb-8 animate-slide-up leading-tight">
                        {slides[currentSlide].title}
                    </h2>
                    <ul className="space-y-4">
                        {slides[currentSlide].bullets.map((bullet, idx) => (
                            <li
                                key={idx}
                                className="text-lg md:text-2xl flex items-start opacity-0 animate-fade-in"
                                style={{ animationDelay: `${idx * 0.5 + 0.3}s`, animationFillMode: 'forwards' }}
                            >
                                <span className="mr-3 text-purple-400">•</span>
                                {bullet}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Footer */}
                <div className="mt-auto flex justify-between items-center text-sm text-black/ dark:text-white/ border-t border-black/ dark:border-white/ pt-4">
                    <div>{title}</div>
                    <div>{currentSlide + 1} / {slides.length}</div>
                </div>
            </div>

            {/* Controls Overlay (Hover) */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors group">
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-center">

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="p-2 rounded-full bg-zinc-900/5 hover:bg-zinc-900/10 text-slate-900 dark:text-white transition-colors"
                        >
                            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        </button>
                        <button
                            onClick={() => { setCurrentSlide(0); setIsPlaying(true); }}
                            className="p-2 rounded-full bg-zinc-900/5 hover:bg-zinc-900/10 text-slate-900 dark:text-white transition-colors"
                            title="Restart"
                        >
                            <RotateCcw size={20} />
                        </button>
                        {isSpeaking && (
                            <div className="flex items-center gap-1 text-purple-300 text-xs font-medium animate-pulse ml-2">
                                <Volume2 size={14} /> Voiceover Active
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={handlePrev}
                            disabled={currentSlide === 0}
                            className="p-2 rounded-full hover:bg-zinc-900/10 text-slate-900 dark:text-white disabled:opacity-30"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={currentSlide === slides.length - 1}
                            className="p-2 rounded-full hover:bg-zinc-900/10 text-slate-900 dark:text-white disabled:opacity-30"
                        >
                            <ChevronRight size={24} />
                        </button>
                    </div>

                    <button
                        onClick={toggleFullscreen}
                        className="p-2 rounded-full bg-zinc-900/5 hover:bg-zinc-900/10 text-slate-900 dark:text-white transition-colors"
                    >
                        {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PresentationViewer;



