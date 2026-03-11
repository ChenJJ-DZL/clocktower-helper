import { useState, useCallback, useRef, useEffect } from 'react';

export function useGameUIServer() {
    const [mounted, setMounted] = useState(false);
    const [showIntroLoading, setShowIntroLoading] = useState(false);
    const [isPortrait, setIsPortrait] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; seatId: number } | null>(null);
    const [showMenu, setShowMenu] = useState(false);
    const introTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const triggerIntroLoading = useCallback(() => {
        setShowIntroLoading(true);
        if (introTimeoutRef.current) clearTimeout(introTimeoutRef.current);
        introTimeoutRef.current = setTimeout(() => {
            setShowIntroLoading(false);
            introTimeoutRef.current = null;
        }, 2000);
    }, []);

    useEffect(() => {
        return () => {
            if (introTimeoutRef.current) clearTimeout(introTimeoutRef.current);
        };
    }, []);

    return {
        mounted, setMounted,
        showIntroLoading, setShowIntroLoading,
        isPortrait, setIsPortrait,
        contextMenu, setContextMenu,
        showMenu, setShowMenu,
        triggerIntroLoading,
        introTimeoutRef,
    };
}
