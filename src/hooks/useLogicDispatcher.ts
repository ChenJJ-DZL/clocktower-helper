import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { GamePhase, Seat } from "@/app/data";
import type { GameAction } from "@/app/gameLogic";
import { processGameEvent } from "@/app/gameLogic";
import { applyActorVictoryFlip } from "../utils/actorVictory";
import { isSeatDead } from "../utils/seatAlive";
import { computeIsPoisoned } from "../utils/gameRules";
import { getScriptSpecialRules } from "../utils/scriptSpecialRules";

export function useLogicDispatcher(
  seats: Seat[],
  // 需支持函数式更新：checkGameOver 内用 setSeats((prev) => ...) 读取最新座位判定胜负
  setSeats: Dispatch<SetStateAction<Seat[]>>,
  gamePhase: GamePhase,
  setGamePhase: (p: GamePhase) => void,
  addLog: (msg: string) => void,
  setWinResult: (r: "good" | "evil" | null) => void,
  setWinReason: (reason: string) => void,
  setCurrentModal: (m: any) => void,
  setExecutedPlayerId: (id: number | null) => void,
  setTodayExecutedId: (id: number | null) => void,
  setCurrentDuskExecution: (id: number | null) => void,
  setHasExecutedThisDay: (b: boolean) => void,
  isVortoxWorld: boolean,
  setVictorySnapshot: (seats: Seat[]) => void,
  evilTwinPair?: { evilId: number; goodId: number } | null,
  /**
   * ⭐ 2026-09-22 新增：剧本级特殊规则判据所需的两项输入
   *   （「游园惊梦」的"固定天数后自动获胜"，见 `utils/scriptSpecialRules.ts`）。
   */
  selectedScript?: { specialRules?: unknown } | null,
  nightCount?: number
) {
  const victoryRef = useRef<{ winner: "good" | "evil"; reason: string } | null>(
    null
  );

  const logicDispatch = useCallback(
    (action: GameAction) => {
      if (victoryRef.current && action.type !== "CHECK_GAME_OVER") {
        console.warn("Game already over. Ignoring action:", action.type);
        return;
      }

      setSeats((prevSeats) => {
        const snapshot = processGameEvent(prevSeats, gamePhase, action);

        if (snapshot.logs.length > 0) {
          for (const msg of snapshot.logs) {
            addLog(msg);
          }
        }

        if (snapshot.winner) {
          const w = snapshot.winner === "Good" ? "good" : "evil";
          const reason = snapshot.winReason || "未知原因";
          victoryRef.current = { winner: w, reason };
          setWinResult(w);
          setWinReason(reason);
          setGamePhase("gameOver");
          // 冻结此时的座位状态作为复盘快照（只保留有角色的座位）
          setVictorySnapshot(snapshot.seats.filter((s) => s.role));
          setCurrentModal({ type: "GAME_OVER", data: null });
        }

        if (!victoryRef.current) {
          if (snapshot.nextActionHint === "BARBER_SWAP_NEEDED") {
            const demon = snapshot.seats.find(
              (s) =>
                (s.role?.type === "demon" || s.isDemonSuccessor) && !s.isDead
            );
            if (demon) {
              setCurrentModal({
                type: "BARBER_SWAP",
                data: { demonId: demon.id, firstId: null, secondId: null },
              });
            }
          }
        }

        if (action.type === "EXECUTE_PLAYER") {
          setExecutedPlayerId(action.targetId);
          setTodayExecutedId(action.targetId);
          setCurrentDuskExecution(action.targetId);
          setHasExecutedThisDay(true);
        }

        return snapshot.seats;
      });
    },
    [
      gamePhase,
      addLog,
      setSeats,
      setWinResult,
      setWinReason,
      setCurrentModal,
      setExecutedPlayerId,
      setTodayExecutedId,
      setCurrentDuskExecution,
      setHasExecutedThisDay,
      setVictorySnapshot,
      setGamePhase,
    ]
  );

  const checkGameOver = useCallback(
    (
      _updatedSeats: Seat[],
      executedPlayerId: number | null = null,
      _isEndOfDay: boolean = false,
      damselGuessed: boolean = false,
      klutzGuessedEvil: boolean = false,
      /**
       * ⭐ 2026-09-22：显式传入 `nightCount`。
       * 剧本级「固定天数后自动获胜」的判据需要**新的**夜序数，而本闭包在同一 tick 内
       * 拿到的是**旧值**（`startSubsequentNight` 刚 dispatch 了 `nightCount + 1`）。
       */
      nightCountOverride?: number
    ) => {
      // 关键修复：基于最新 React 状态(prevSeats)判定胜负，避免用外部传入的
      // 陈旧快照覆盖并发的击杀/状态变更（例如 executePlayer 先 killPlayer 再
      // checkGameOver，若用击杀前的快照会回写并抹掉刚发生的死亡）。
      setSeats((prevSeats) => {
        const seatsForCheck = prevSeats;

        // 🎯 官方规则：场上所有玩家均已死亡 → 对局必须立即结束，不能继续昼夜循环。
        const aliveSeats = seatsForCheck.filter(
          (s) => s.role && !isSeatDead(s)
        );
        if (seatsForCheck.some((s) => s.role) && aliveSeats.length === 0) {
          const demonAlive = aliveSeats.some((s) => s.role?.type === "demon");
          const w: "good" | "evil" = demonAlive ? "evil" : "good";
          const reason = "场上所有玩家均已死亡，对局立即结束";
          victoryRef.current = { winner: w, reason };
          addLog(
            "☠️ " + reason + "：" + (w === "good" ? "善良" : "邪恶") + "阵营获胜！"
          );
          setWinResult(w);
          setWinReason(reason);
          setGamePhase("gameOver");
          setVictorySnapshot(seatsForCheck.filter((s) => s.role));
          setCurrentModal({ type: "GAME_OVER", data: null });
          return seatsForCheck;
        }
        const mastermind = seatsForCheck.find(
          (s) =>
            s.role?.id === "mastermind" &&
            !s.isDead &&
            !computeIsPoisoned(s, seatsForCheck)
        );
        const isMastermindActive = !!mastermind;

        const action: GameAction = {
          type: "CHECK_GAME_OVER",
          executedId: executedPlayerId || undefined,
          lastAction: executedPlayerId ? "execution" : "check_phase",
          context: {
            damselGuessed,
            klutzGuessedEvil,
            isVortoxWorld,
            isMastermindActive,
            evilTwinPair,
            // ⭐ 剧本级特殊规则（判据在 utils/scriptSpecialRules，本处只透传）
            scriptSpecialRules: getScriptSpecialRules(selectedScript),
            nightCount: nightCountOverride ?? nightCount ?? 0,
          },
        };
        const snapshot = processGameEvent(seatsForCheck, gamePhase, action);

        if (snapshot.logs.length > 0) {
          for (const msg of snapshot.logs) {
            addLog(msg);
          }
        }

        if (snapshot.winner) {
          // 🎭 戏子（Actor）：只要有戏子在场（不论死活/数量），胜负结果对调
          let w: "good" | "evil" = snapshot.winner === "Good" ? "good" : "evil";
          const flipped = applyActorVictoryFlip(w, seatsForCheck);
          if (flipped && flipped !== w) {
            addLog(
              `🎭 戏子在场，胜负结果对调：${flipped === "good" ? "善良" : "邪恶"}阵营获胜！`
            );
            w = flipped;
          }
          const reason = snapshot.winReason || "未知原因";
          victoryRef.current = { winner: w, reason };
          setWinResult(w);
          setWinReason(reason);
          setGamePhase("gameOver");
          setVictorySnapshot(snapshot.seats.filter((s) => s.role));
          setCurrentModal({ type: "GAME_OVER", data: null });
        }
        return snapshot.seats;
      });
    },
    [
      gamePhase,
      addLog,
      setSeats,
      setWinResult,
      setWinReason,
      setGamePhase,
      setVictorySnapshot,
      setCurrentModal,
      isVortoxWorld,
      evilTwinPair,
    ]
  );

  /**
   * ⭐ 2026-09-22 剧本级特殊规则触发点：「固定天数后自动获胜」
   * ------------------------------------------------------------------
   * 官方（游园惊梦）简介逐字：「……**恶魔不会在夜晚攻击，但是会在固定的天数后自动获胜**。」
   *   该剧本的官方 wiki 只有简介、无规则细节 ⇒ 天数与判定时点由**用户裁定**（2026-09-22）：
   *   **进入第 N+1 个夜晚时**（= 第 N 个白天结束 / 黄昏结束）判定。
   *
   * ⚠️ 为什么用 effect 而不在 `startSubsequentNight` 里直接调：
   *   进入夜晚是 `baseDispatch(updateState({ nightCount: nightCount + 1 }))` 之后**同一 tick**
   *   发生的，`checkGameOver` 闭包捕获的 `nightCount` 还是**旧值** ⇒ 直接调会**漏判**。
   *   effect 在**本次渲染提交后**执行 ⇒ 拿到的是**新值** ✓
   *
   * 幂等：`scriptRuleFiredRef` 每夜只判一次；`checkGameOver` 内另有 `victoryRef` 守卫。
   * 只对**声明了本规则**的剧本生效 ⇒ 不影响其它剧本，也不给涡流等既有分支引入新调用点。
   */
  const scriptRuleFiredRef = useRef<number | null>(null);
  useEffect(() => {
    if (gamePhase !== "night") return;
    if (victoryRef.current) return;
    const rules = getScriptSpecialRules(selectedScript);
    if (!rules.evilAutoWinOnEnteringNight) return;
    if (scriptRuleFiredRef.current === nightCount) return;
    scriptRuleFiredRef.current = nightCount ?? -1;
    checkGameOver(seats, null, false, false, false, nightCount);
  }, [gamePhase, nightCount, selectedScript, checkGameOver, seats]);

  const declareMayorImmediateWin = useCallback(() => {
    // 🎭 戏子在场：镇长宣布的善良胜利被对调为邪恶胜利
    const flipped = applyActorVictoryFlip("good", seats);
    addLog(
      flipped === "good"
        ? "镇长发动能力：宣布善良阵营获胜！"
        : "🎭 戏子在场，镇长宣布的善良胜利被对调：邪恶阵营获胜！"
    );
    setWinResult(flipped ?? "good");
    setWinReason(flipped === "good" ? "镇长能力发动" : "戏子在场，胜负对调");
    setGamePhase("gameOver");
    setVictorySnapshot(seats.filter((s) => s.role));
    setCurrentModal({ type: "GAME_OVER", data: null });
  }, [
    addLog,
    setWinResult,
    setWinReason,
    setGamePhase,
    setVictorySnapshot,
    seats,
    setCurrentModal,
  ]);

  return {
    victoryRef,
    logicDispatch,
    checkGameOver,
    declareMayorImmediateWin,
  };
}
