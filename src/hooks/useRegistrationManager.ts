import { useCallback, useRef } from 'react';
import { Seat, Role } from '@/app/data';
import { getRegistration } from '../utils/gameRules';

export function useRegistrationManager(
    gamePhase: string,
    nightCount: number,
    spyDisguiseMode: 'off' | 'default' | 'on',
    spyDisguiseProbability: number
) {
    const registrationCacheRef = useRef<Map<string, any>>(new Map());
    const registrationCacheKeyRef = useRef<string>('');

    const resetRegistrationCache = useCallback((key: string) => {
        registrationCacheRef.current = new Map();
        registrationCacheKeyRef.current = key;
    }, []);

    const getRegistrationCached = useCallback((targetPlayer: Seat, viewingRole?: Role | null) => {
        const cacheKey = registrationCacheKeyRef.current || `${gamePhase}-${nightCount}`;
        return getRegistration(
            targetPlayer,
            viewingRole,
            spyDisguiseMode,
            spyDisguiseProbability,
            { cache: registrationCacheRef.current, cacheKey }
        );
    }, [gamePhase, nightCount, spyDisguiseMode, spyDisguiseProbability]);

    return {
        registrationCacheRef,
        registrationCacheKeyRef,
        resetRegistrationCache,
        getRegistrationCached,
    };
}
