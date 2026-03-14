import { useMemo } from "react";
import { gameActions, useGameContext } from "../contexts/GameContext";

export function useGameRoleState() {
  const { state, dispatch } = useGameContext();
  const {
    todayDemonVoted,
    todayMinionNominated,
    todayExecutedId,
    witchCursedId,
    witchActive,
    cerenovusTarget,
    isVortoxWorld,
    fangGuConverted,
    jugglerGuesses,
    evilTwinPair,
    outsiderDiedToday,
  } = state;

  return useMemo(
    () => ({
      todayDemonVoted,
      setTodayDemonVoted: (v: boolean) =>
        dispatch(gameActions.updateState({ todayDemonVoted: v })),
      todayMinionNominated,
      setTodayMinionNominated: (v: boolean) =>
        dispatch(gameActions.updateState({ todayMinionNominated: v })),
      todayExecutedId,
      setTodayExecutedId: (id: number | null) =>
        dispatch(gameActions.updateState({ todayExecutedId: id })),
      witchCursedId,
      setWitchCursedId: (id: number | null) =>
        dispatch(gameActions.updateState({ witchCursedId: id })),
      witchActive,
      setWitchActive: (v: boolean) =>
        dispatch(gameActions.updateState({ witchActive: v })),
      cerenovusTarget,
      setCerenovusTarget: (
        target: { targetId: number; roleName: string } | null
      ) => dispatch(gameActions.updateState({ cerenovusTarget: target })),
      isVortoxWorld,
      setIsVortoxWorld: (v: boolean) =>
        dispatch(gameActions.updateState({ isVortoxWorld: v })),
      fangGuConverted,
      setFangGuConverted: (v: boolean) =>
        dispatch(gameActions.updateState({ fangGuConverted: v })),
      jugglerGuesses,
      setJugglerGuesses: (guesses: any) =>
        dispatch(gameActions.updateState({ jugglerGuesses: guesses })),
      evilTwinPair: evilTwinPair
        ? ([evilTwinPair.evilId, evilTwinPair.goodId] as [number, number])
        : null,
      setEvilTwinPair: (pair: [number, number] | null) => {
        const next = pair ? { evilId: pair[0], goodId: pair[1] } : null;
        dispatch(gameActions.updateState({ evilTwinPair: next }));
      },
      outsiderDiedToday,
      setOutsiderDiedToday: (v: boolean) =>
        dispatch(gameActions.setOutsiderDiedToday(v)),
    }),
    [
      dispatch,
      todayDemonVoted,
      todayMinionNominated,
      todayExecutedId,
      witchCursedId,
      witchActive,
      cerenovusTarget,
      isVortoxWorld,
      fangGuConverted,
      jugglerGuesses,
      evilTwinPair,
      outsiderDiedToday,
    ]
  );
}
