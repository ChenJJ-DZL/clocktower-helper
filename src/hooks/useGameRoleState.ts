import { useState } from 'react';

export function useGameRoleState() {
    const [todayDemonVoted, setTodayDemonVoted] = useState(false);
    const [todayMinionNominated, setTodayMinionNominated] = useState(false);
    const [todayExecutedId, setTodayExecutedId] = useState<number | null>(null);
    const [witchCursedId, setWitchCursedId] = useState<number | null>(null);
    const [witchActive, setWitchActive] = useState(true);
    const [cerenovusTarget, setCerenovusTarget] = useState<{ targetId: number; roleName: string } | null>(null);
    const [isVortoxWorld, setIsVortoxWorld] = useState(false);
    const [fangGuConverted, setFangGuConverted] = useState(false);
    const [jugglerGuesses, setJugglerGuesses] = useState<Record<number, string>>({});
    const [evilTwinPair, setEvilTwinPair] = useState<[number, number] | null>(null);
    const [outsiderDiedToday, setOutsiderDiedToday] = useState(false);

    return {
        todayDemonVoted, setTodayDemonVoted,
        todayMinionNominated, setTodayMinionNominated,
        todayExecutedId, setTodayExecutedId,
        witchCursedId, setWitchCursedId,
        witchActive, setWitchActive,
        cerenovusTarget, setCerenovusTarget,
        isVortoxWorld, setIsVortoxWorld,
        fangGuConverted, setFangGuConverted,
        jugglerGuesses, setJugglerGuesses,
        evilTwinPair, setEvilTwinPair,
        outsiderDiedToday, setOutsiderDiedToday,
    };
}
