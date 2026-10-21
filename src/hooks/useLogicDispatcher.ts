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
  addLog: (msg: string | { message: string; summary?: string }) => void,
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
  nightCount?: number,
  /**
   * ⭐ 2026-10-21：主谋「额外一夜一昼」状态写入口。
   *
   * 🔴 修复的缺陷：`mastermindFinalDay` 此前**只有 `setMastermindFinalDay(null)`**，
   *   从来没有任何地方把它设为 `{active:true}` ⇒ 额外一天永远不被标记，
   *   「那个白天有人被处决则其阵营落败」这条官方规则完全没生效。
   *
   * 可选参数：不传则退化为旧行为（不标记），避免影响其他调用方/测试。
   */
  setMastermindFinalDay?: (v: { active: boolean; triggeredAtNight: number } | null) => void,
  /**
   * 🔴 2026-10-21：**共享座位镜像**（可选）。
   *
   * 为什么需要（真实缺陷，贞洁者 E2E 实测抓到）：
   *   本 hook 曾自己维护一份 `seatsRef`，在**渲染期**同步 `seats` prop。
   *   而 `useDayActions` 是先 `commitSeats(updatedSeats)`（控制器那一份 ref 立刻更新），
   *   紧接着调用 `checkGameOver(...)`。此时本 hook 的 ref 仍是**上一帧**的座位
   *   ⇒ `checkGameOver` 按旧座位判定后 `commitSeats(snapshot.seats)` 把**旧数组写回**
   *   ⇒ 刚刚落库的「贞洁者处决提名者」被抹掉：
   *     · 座位 `isDead` 从 true 变回 false（死亡丢失）；
   *     · `hasUsedVirginAbility` 也被回滚（技能可重复触发）；
   *     · 只有 `executedPlayerId / todayExecutedId` 这两个标量活下来。
   *   这类「两份 ref 各自同步」必然分叉 —— 修法是**只留一份**：由调用方把
   *   `useGameController` 的 `seatsRef` 传进来，两边读写同一对象。
   */
  sharedSeatsRef?: { current: Seat[] }
) {
  const victoryRef = useRef<{ winner: "good" | "evil"; reason: string } | null>(
    null
  );

  /**
   * 🔴 2026-10-21：座位真值的**同步镜像** —— 把「副作用」从 `setSeats(updater)` 里救出来。
   *
   * 背景（实测证据，游园惊梦 5 人局 seed=91008）：
   *   旧实现把 `addLog / setWinResult / setGamePhase("gameOver") / setCurrentModal`
   *   **全部写在 `setSeats(prev => { ... })` 的 updater 内部**。updater 属于 React
   *   的**渲染期**执行路径，React 允许它被**多次调用或整体丢弃**（并发渲染 / 紧急更新
   *   打断），因此在里面 dispatch 其它状态是未定义行为。
   *
   *   症状：第 3 个白天「存活 ≤ 2」判出邪恶胜 ⇒ `setWinResult("evil")` 生效了，
   *   但同一批的 `setGamePhase("gameOver")` 被丢弃 ⇒ 状态机成了
   *   「已有胜负 + 阶段仍是 day」的诡异中间态：
   *     · HUD 显示「第 4 天」而不是「邪恶阵营胜利」；
   *     · 快照保存 effect 的 `!winResult` 门禁把写入整段掐断（快照冻结在第 3 夜）；
   *     · 剧本级自动获胜 effect 被 `victoryRef` 挡住 ⇒ 永不触发。
   *
   * 修法：用 `seatsRef` 同步镜像最新座位，`processGameEvent` 与胜负判定都在
   *   **普通函数体**里算完，副作用按常规 dispatch 发出，最后才把座位一次性写入。
   *   同一 tick 内连续 dispatch 也能看到彼此的写入（commitSeats 会同步更新 ref），
   *   语义不比原来的函数式更新弱。
   */
  const localSeatsRef = useRef<Seat[]>(seats);
  // 兼容旧调用方（未传共享镜像）：本 hook 在渲染期自同步；
  // 传了共享镜像时，同步责任在 useGameController（同一份 ref，勿重复写）。
  if (!sharedSeatsRef) localSeatsRef.current = seats;
  const seatsRef = sharedSeatsRef ?? localSeatsRef;
  const commitSeats = useCallback(
    (next: Seat[]) => {
      seatsRef.current = next;
      setSeats(next);
    },
    [setSeats]
  );

  const logicDispatch = useCallback(
    (action: GameAction) => {
      if (victoryRef.current && action.type !== "CHECK_GAME_OVER") {
        console.warn("Game already over. Ignoring action:", action.type);
        return;
      }

      // ⚠️ 不在 updater 里做任何副作用（见 seatsRef 注释）
      const snapshot = processGameEvent(seatsRef.current, gamePhase, action);
      commitSeats(snapshot.seats);

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
    },
    [
      gamePhase,
      addLog,
      commitSeats,
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
      // 关键：基于 `seatsRef` 里的**最新座位**判定胜负，避免用外部传入的陈旧快照
      // 覆盖并发的击杀/状态变更（例如 executePlayer 先 killPlayer 再 checkGameOver）。
      // ⚠️ 副作用不得写进 setSeats updater（见文件内 seatsRef 的长注释）。
      const seatsForCheck = seatsRef.current;

      {
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
          return;
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

        // 🧠 主谋：恶魔死于处决 ⇒ 进入「额外一夜一昼」，激活状态标记
        if (
          (snapshot as any).nextActionHint === "MASTERMIND_EXTRA_DAY" &&
          setMastermindFinalDay
        ) {
          setMastermindFinalDay({
            active: true,
            triggeredAtNight: nightCountOverride ?? nightCount ?? 0,
          });
        }

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
        // 座位写回放在**所有副作用之后**，且是纯写入（不再有 updater 内副作用）
        commitSeats(snapshot.seats);
      }
    },
    [
      gamePhase,
      addLog,
      commitSeats,
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

  /**
   * 🛟 存活阈值兜底（2026-10-21）：进入白天时若「可计存活 ≤ 2」而还没有胜负，
   *   立刻补判一次终局。
   *
   *   为什么需要：夜杀有多条路径（新引擎 markedForDeath、旧 killPlayer、
   *   角色专属钩子如方古/军团/对局外来源），只要有一条漏了 `checkGameOver`，
   *   游戏就会带着 1 个活人继续跑夜晚 —— 实测 5 人局跑到「只有恶魔存活」仍在
   *   唤醒方古选目标，而场上已无人可杀（夜间驱动器直接超时）。
   *   幂等：`thresholdFiredRef` 记录 (阶段+夜数)，`checkGameOver` 内另有 victoryRef 守卫。
   */
  const thresholdFiredRef = useRef<string | null>(null);
  useEffect(() => {
    // 官方「仅剩 2 名玩家存活 ⇒ 邪恶胜」不分昼夜：任何阶段切换都要兜一次
    if (
      gamePhase !== "day" &&
      gamePhase !== "dawnReport" &&
      gamePhase !== "dusk" &&
      gamePhase !== "twilight" &&
      gamePhase !== "night" &&
      gamePhase !== "firstNight"
    )
      return;
    if (victoryRef.current) return;
    const alive = seats.filter((s) => s.role && !isSeatDead(s));
    if (alive.length > 2) return;
    const key = `${gamePhase}:${nightCount}:${alive.length}`;
    if (thresholdFiredRef.current === key) return;
    thresholdFiredRef.current = key;
    checkGameOver(seats, null, false, false, false, nightCount);
  }, [gamePhase, nightCount, seats, checkGameOver]);

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
