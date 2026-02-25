'use client';

import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

export type AudioType = 'night' | 'day' | 'vote' | 'execute' | 'click' | 'bell';

interface AudioContextType {
    isMuted: boolean;
    toggleMute: () => void;
    playSound: (type: AudioType) => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export const AudioProvider = ({ children }: { children: ReactNode }) => {
    const [isMuted, setIsMuted] = useState(false);

    // We will simply use generic base64 or placeholder silent audio if real audio isn't available
    // This avoids build errors in Next.js when assets are missing
    const audioRefs = useRef<Record<AudioType, HTMLAudioElement | null>>({
        night: null,
        day: null,
        vote: null,
        execute: null,
        click: null,
        bell: null,
    });

    useEffect(() => {
        // Only initialize in browser environment
        if (typeof window !== 'undefined') {
            audioRefs.current = {
                // Placeholders: to be replaced with actual /sounds/day.mp3 files later
                night: new Audio('/sounds/night.mp3'),
                day: new Audio('/sounds/day.mp3'),
                vote: new Audio('/sounds/vote.mp3'),
                execute: new Audio('/sounds/execute.mp3'),
                click: new Audio('/sounds/click.mp3'),
                bell: new Audio('/sounds/bell.mp3'),
            };

            // Set volume for all
            Object.values(audioRefs.current).forEach(audio => {
                if (audio) {
                    audio.volume = 0.5;
                    // Ignore missing file errors silently during prototyping
                    audio.addEventListener('error', (e) => {
                        e.preventDefault();
                        // We can suppress errors if files don't exist yet
                    });
                }
            });
        }
    }, []);

    const toggleMute = () => setIsMuted(prev => !prev);

    const playSound = (type: AudioType) => {
        if (isMuted) return;
        const audio = audioRefs.current[type];
        if (audio) {
            // Reset playhead to allow rapid re-playing (e.g., clicking)
            audio.currentTime = 0;
            audio.play().catch(e => {
                // Autoplay policies or missing files might block this, fail silently
                // console.warn(`Failed to play ${type} audio`);
            });
        }
    };

    return (
        <AudioContext.Provider value={{ isMuted, toggleMute, playSound }}>
            {children}
        </AudioContext.Provider>
    );
};

export const useAudio = () => {
    const context = useContext(AudioContext);
    if (!context) {
        throw new Error('useAudio must be used within an AudioProvider');
    }
    return context;
};
