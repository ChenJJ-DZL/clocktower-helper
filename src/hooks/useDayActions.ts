/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useMemo } from "react";
import type { GamePhase, Role, Seat } from "../../app/data";
import { getRoleDefinition } from "../roles";
import type { ModalType } from "../types/modal";
import type { DayActionContext } from "../types/roleDefinition";
import {
  checkCannotGainAbility,
  isAntagonismEnabled,
} from "../utils/antagonism";
import { showAlert } from "../utils/nativeDialogShim";

/**
 * DayAbilityConfig 类型重新声明（与 useGameController 中一致）
 */
export interface DayAbilityConfig {
  roleId: string;
  title: string;
  description: string;
  usage: "daily" | "once";
  actionType?: "lunaticKill";
  logMessage: (seat: Seat) => string;
}

/**
 * 白天行动函数的依赖接口
 */
export interface DayActionsDeps {
  // State
  seats: Seat[];
  roles: Role[];
  currentModal: ModalType;
  gamePhase: GamePhase;
  nominationMap: Record<number, number>;
  nominationRecords: { nominators: Set<number>; nominees: Set<number> };
  witchActive: boolean;
  witchCursedId: number | null;
  virginGuideInfo: {
    targetId: number;
    nominatorId: number;
    isFirstTime: boolean;
    nominatorIsTownsfolk: boolean;
  } | null;
  dayAbilityForm: Record<string, any>;

  // Setters
  setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setNominationMap: React.Dispatch<
    React.SetStateAction<Record<number, number>>
  >;
  setNominationRecords: React.Dispatch<
    React.SetStateAction<{ nominators: Set<number>; nominees: Set<number> }>
  >;
  setTodayMinionNominated: React.Dispatch<React.SetStateAction<boolean>>;
  setVirginGuideInfo: React.Dispatch<React.SetStateAction<any>>;
  setWitchCursedId: React.Dispatch<React.SetStateAction<number | null>>;
  setWitchActive: React.Dispatch<React.SetStateAction<boolean>>;
  setVoteInputValue: (val: string) => void;
  setShowVoteErrorToast: (val: boolean) => void;
  setExecutedPlayerId: React.Dispatch<React.SetStateAction<number | null>>;
  setTodayExecutedId: React.Dispatch<React.SetStateAction<number | null>>;
  setHasExecutedThisDay:
    | React.Dispatch<React.SetStateAction<boolean>>
    | undefined;
  setCurrentDuskExecution: React.Dispatch<React.SetStateAction<number | null>>;
  setVfxTrigger: React.Dispatch<React.SetStateAction<any>>;
  setWinResult: React.Dispatch<React.SetStateAction<any>>;
  setWinReason: React.Dispatch<React.SetStateAction<string | null>>;
  setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;
  setDayAbilityForm: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setVotedThisRound: React.Dispatch<React.SetStateAction<number[]>>;

  // Functions
  addLog: (msg: string) => void;
  killPlayer: (targetId: number, options?: any) => void;
  checkGameOver: (
    seats: Seat[],
    executedPlayerId?: number | null,
    isEndOfDay?: boolean,
    damselGuessed?: boolean,
    klutzGuessedEvil?: boolean
  ) => void;
  isActorDisabledByPoisonOrDrunk: (seat: Seat) => boolean;
  getRegistrationCached: (targetPlayer: Seat, viewingRole?: Role | null) => any;
  saveHistory: () => void;
  hasUsedAbility: (roleId: string, seatId: number) => boolean;
  hasUsedDailyAbility: (roleId: string, seatId: number) => boolean;
  markAbilityUsed: (roleId: string, seatId: number) => void;
  markDailyAbilityUsed: (roleId: string, seatId: number) => void;
  continueToNextAction: () => void;
  proceedToFirstNight: (rolesToUse?: Role[]) => void;
  changeRole: (seatId: number, roleId: string, roles: Role[]) => void;
  dispatch: (action: any) => void;
}

/**
 * useDayActions - 处理白天行动的 Hook
 * 从 useGameController 中提取的 Group B 函数
 */
export function useDayActions(deps: DayActionsDeps) {
  const {
    seats,
    roles,
    currentModal,
    gamePhase,
    nominationMap,
    nominationRecords,
    witchActive,
    witchCursedId,
    virginGuideInfo,
    setCurrentModal,
    setSeats,
    setNominationMap,
    setNominationRecords,
    setTodayMinionNominated,
    setVirginGuideInfo,
    setWitchCursedId,
    setWitchActive,
    setVoteInputValue,
    setShowVoteErrorToast,
    setExecutedPlayerId,
    setTodayExecutedId,
    setHasExecutedThisDay,
    setCurrentDuskExecution,
    setVfxTrigger,
    setWinResult,
    setWinReason,
    setGamePhase,
    setDayAbilityForm,
    setVotedThisRound,
    addLog,
    killPlayer,
    checkGameOver,
    isActorDisabledByPoisonOrDrunk,
    getRegistrationCached,
    saveHistory,
    hasUsedAbility,
    hasUsedDailyAbility,
    markAbilityUsed,
    markDailyAbilityUsed,
    continueToNextAction,
    proceedToFirstNight,
    changeRole,
    dispatch,
  } = deps;

  const executeNomination = useCallback(
    (
      sourceId: number,
      id: number,
      options?: {
        virginGuideOverride?: {
          isFirstTime: boolean;
          nominatorIsTownsfolk: boolean;
        };
        openVoteModal?: boolean;
      }
    ) => {
      const nominatorSeat = seats.find((s) => s.id === sourceId);
      if (!nominatorSeat || nominatorSeat.isDead) {
        addLog("只有存活的玩家可以发起提名");
        return;
      }

      const nominatorsSet =
        nominationRecords?.nominators instanceof Set
          ? nominationRecords.nominators
          : new Set(
              Array.isArray(nominationRecords?.nominators)
                ? nominationRecords.nominators
                : []
            );
      const nomineesSet =
        nominationRecords?.nominees instanceof Set
          ? nominationRecords.nominees
          : new Set(
              Array.isArray(nominationRecords?.nominees)
                ? nominationRecords.nominees
                : []
            );

      if (nominatorsSet.has(sourceId)) {
        addLog(
          `每名玩家每个黄昏只能发起一次提名（${sourceId + 1}号本黄昏已发起过提名）`
        );
        return false;
      }

      if (nomineesSet.has(id)) {
        addLog(`每名玩家每个黄昏只能被提名一次（${id + 1}号本黄昏已被提名过）`);
        return false;
      }

      saveHistory();

      if (witchActive && witchCursedId !== null) {
        const aliveCount = seats.filter((s) => !s.isDead).length;
        if (aliveCount > 3 && witchCursedId === sourceId) {
          addLog(`${sourceId + 1}发起提名触发女巫诅咒立刻死亡`);
          killPlayer(sourceId, {
            skipGameOverCheck: false,
            recordNightDeath: false,
          });
          setWitchCursedId(null);
          setWitchActive(false);
          return false;
        }
      }
      setNominationMap({ [id]: sourceId });

      // 爪牙提名判定（城镇公告员）：
      // 陌客默认注册为邪恶爪牙（造成干扰），间谍默认注册为善良（不主动算爪牙）
      const isRecluseMinion =
        nominatorSeat?.role?.id === "recluse" &&
        (nominatorSeat as any).registerAsEvil !== false;
      const isSpyGood =
        nominatorSeat?.role?.id === "spy" &&
        (nominatorSeat as any).registerAsGood !== false &&
        (nominatorSeat as any).registerAsEvil !== true;
      const isActualMinion =
        nominatorSeat?.role?.type === "minion" && !isSpyGood;
      if (isActualMinion || isRecluseMinion) {
        setTodayMinionNominated(true);
      }

      const target = seats.find((s) => s.id === id);
      const virginOverride = options?.virginGuideOverride;

      // 🔧 贞洁者（Virgin）规则：
      // 官方规则：当你首次被提名时，如果提名你的玩家是镇民，他立刻被处决。
      // 间谍默认注册为镇民（造成干扰），若间谍提名贞洁者，间谍被处决！
      // 陌客默认注册为邪恶/爪牙/恶魔（造成干扰），若陌客提名贞洁者，不触发处决。
      if (target?.role?.id === "virgin") {
        const isVirginUsed = !!(
          hasUsedAbility("virgin", id) ||
          target.hasUsedVirginAbility ||
          (target as any).hasBeenNominated ||
          (target as any).abilityUsed ||
          virginOverride?.isFirstTime === false
        );

        if (isVirginUsed) {
          addLog(
            `提示：【${id + 1}号-贞洁者】在整局游戏中已被提名过，其被动技能是一次性的且已失效，本次提名按正常投票流程处理`
          );
        } else {
          // 首次被提名：永久消耗贞洁者能力（双重持久化：markAbilityUsed + Seat 状态）
          markAbilityUsed("virgin", id);

          const isVirginDisabled = isActorDisabledByPoisonOrDrunk(target);
          const isSpyAsTownsfolk =
            nominatorSeat?.role?.id === "spy" &&
            (nominatorSeat as any).registerAsGood !== false &&
            (nominatorSeat as any).registerAsEvil !== true;
          const isRecluseAsTownsfolk =
            nominatorSeat?.role?.id === "recluse" &&
            (nominatorSeat as any).registerAsTownsfolk === true;
          const isRealTownsfolk =
            virginOverride?.nominatorIsTownsfolk ??
            (nominatorSeat &&
              ((nominatorSeat.role?.type === "townsfolk" &&
                nominatorSeat.role?.id !== "drunk" &&
                nominatorSeat.role?.id !== "recluse") ||
                isSpyAsTownsfolk ||
                isRecluseAsTownsfolk) &&
              !nominatorSeat.isDrunk &&
              !isActorDisabledByPoisonOrDrunk(nominatorSeat));

          const nominatorName = nominatorSeat?.role?.name || "镇民";

          if (!isVirginDisabled && isRealTownsfolk) {
            // 条件 ① + ② 均满足：处决提名者，跳过投票环节，当天白天结束推进至夜晚
            const updatedSeats = seats.map((s) => {
              if (s.id === id) {
                return {
                  ...s,
                  hasBeenNominated: true,
                  hasUsedVirginAbility: true,
                  abilityUsed: true,
                };
              }
              if (s.id === sourceId) {
                return { ...s, isDead: true };
              }
              return s;
            });
            setSeats(updatedSeats);

            setExecutedPlayerId(sourceId);
            setTodayExecutedId(sourceId);
            setHasExecutedThisDay?.(true);
            setCurrentDuskExecution(sourceId);

            setNominationMap({});
            setNominationRecords(
              (prev: { nominators: Set<number>; nominees: Set<number> }) => ({
                nominators: new Set(
                  prev?.nominators
                    ? prev.nominators instanceof Set
                      ? prev.nominators
                      : prev.nominators
                    : []
                ).add(sourceId),
                nominees: new Set(
                  prev?.nominees
                    ? prev.nominees instanceof Set
                      ? prev.nominees
                      : prev.nominees
                    : []
                ).add(id),
              })
            );

            addLog(
              `📣 【${sourceId + 1}号-${nominatorName}】提名了【${id + 1}号-贞洁者】`
            );
            addLog(
              `⚡️ 触发贞洁者能力：因【${sourceId + 1}号-${nominatorName}】是真实镇民，【${sourceId + 1}号】被立即处决死亡！`
            );

            checkGameOver(updatedSeats, sourceId);

            setCurrentModal({
              type: "EXECUTION_RESULT",
              data: {
                message: `【${sourceId + 1}号-${nominatorName}】提名了【${id + 1}号-贞洁者】\n触发贞洁者能力，【${sourceId + 1}号】被立即处决死亡！`,
                isVirginTrigger: true,
              },
            });
            // 🔧 返回 virginHandled 标记：贞洁者已自动处决提名者（跳过投票环节）
            return { success: true, virginHandled: true };
          } else {
            // 首次被提名，但贞洁者中毒醉酒或提名者非真实镇民：不处决，但能力已消耗
            setSeats((prevSeats) =>
              prevSeats.map((s) =>
                s.id === id
                  ? {
                      ...s,
                      hasBeenNominated: true,
                      hasUsedVirginAbility: true,
                      abilityUsed: true,
                    }
                  : s
              )
            );
            addLog(
              `📣 【${sourceId + 1}号-${nominatorSeat?.role?.name || "玩家"}】提名了【${id + 1}号-贞洁者】`
            );
            if (isVirginDisabled) {
              addLog(
                `ℹ️ 【${id + 1}号-贞洁者】处于中毒/醉酒状态，被动能力失效，贞洁者技能已消耗`
              );
            } else {
              addLog(
                `ℹ️ 【${sourceId + 1}号】非真实镇民，未触发贞洁者处决，贞洁者技能已消耗`
              );
            }
          }
        }
      }

      if (nominatorSeat?.role?.id === "golem") {
        const targetSeat = seats.find((s) => s.id === id);
        const isDemon =
          targetSeat &&
          (targetSeat.role?.type === "demon" || targetSeat.isDemonSuccessor);
        if (!isDemon) {
          addLog(
            `${sourceId + 1}号(魔像) 提名 ${id + 1}号，${id + 1}号不是恶魔，${id + 1}号死亡`
          );
          dispatch({ type: "KILL_PLAYER", targetId: id, source: "golem" });
        }
        setSeats((p) =>
          p.map((s) =>
            s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s
          )
        );
      }

      setNominationRecords(
        (prev: { nominators: Set<number>; nominees: Set<number> }) => ({
          nominators: new Set(
            prev?.nominators
              ? prev.nominators instanceof Set
                ? prev.nominators
                : prev.nominators
              : []
          ).add(sourceId),
          nominees: new Set(
            prev?.nominees
              ? prev.nominees instanceof Set
                ? prev.nominees
                : prev.nominees
              : []
          ).add(id),
        })
      );
      addLog(`${sourceId + 1}号提名 ${id + 1}号`);
      setVoteInputValue("");
      setShowVoteErrorToast(false);
      if (options?.openVoteModal !== false) {
        setCurrentModal({ type: "VOTE_INPUT", data: { voterId: id } });
      }
      return { success: true, virginHandled: false };
    },
    [
      nominationRecords,
      seats,
      witchActive,
      witchCursedId,
      killPlayer,
      addLog,
      setNominationMap,
      setTodayMinionNominated,
      setSeats,
      setCurrentModal,
      setNominationRecords,
      setVoteInputValue,
      setShowVoteErrorToast,
      setWitchCursedId,
      setWitchActive,
      isActorDisabledByPoisonOrDrunk,
      setExecutedPlayerId,
      setTodayExecutedId,
      setHasExecutedThisDay,
      setCurrentDuskExecution,
      dispatch,
      hasUsedAbility,
      markAbilityUsed,
      checkGameOver,
      saveHistory,
    ]
  );

  const cancelNomination = useCallback(
    (nominatorId?: number | null, nomineeId?: number | null) => {
      setNominationRecords(
        (prev: { nominators: Set<number>; nominees: Set<number> }) => {
          const newNominators = new Set(
            prev?.nominators
              ? prev.nominators instanceof Set
                ? prev.nominators
                : prev.nominators
              : []
          );
          const newNominees = new Set(
            prev?.nominees
              ? prev.nominees instanceof Set
                ? prev.nominees
                : prev.nominees
              : []
          );
          if (nominatorId !== undefined && nominatorId !== null) {
            newNominators.delete(nominatorId);
          }
          if (nomineeId !== undefined && nomineeId !== null) {
            newNominees.delete(nomineeId);
          }
          return { nominators: newNominators, nominees: newNominees };
        }
      );
      setNominationMap((prev) => {
        if (!prev) return {};
        const next = { ...prev };
        if (nomineeId !== undefined && nomineeId !== null) {
          delete next[nomineeId];
        } else {
          return {};
        }
        return next;
      });
      const nominatorText =
        nominatorId !== undefined && nominatorId !== null
          ? `${nominatorId + 1}号`
          : "";
      const nomineeText =
        nomineeId !== undefined && nomineeId !== null
          ? `${nomineeId + 1}号`
          : "";
      const pairText =
        nominatorText || nomineeText
          ? `（${nominatorText}${nominatorText && nomineeText ? " → " : ""}${nomineeText}）`
          : "";
      addLog(`ℹ️ 取消了提名${pairText}，已恢复提名与被提名资格`);
    },
    [setNominationRecords, setNominationMap, addLog]
  );

  const handleVirginGuideConfirm = useCallback(() => {
    if (!virginGuideInfo) return;
    executeNomination(virginGuideInfo.nominatorId, virginGuideInfo.targetId, {
      virginGuideOverride: {
        isFirstTime: virginGuideInfo.isFirstTime,
        nominatorIsTownsfolk: virginGuideInfo.nominatorIsTownsfolk,
      },
    });
    setVirginGuideInfo(null);
    setCurrentModal(null);
  }, [virginGuideInfo, executeNomination, setVirginGuideInfo, setCurrentModal]);

  const handleDayAction = useCallback(
    (id: number) => {
      if (currentModal?.type !== "DAY_ACTION") return;
      const { type, sourceId } = currentModal.data;
      setCurrentModal(null);
      if (type === "nominate") {
        executeNomination(sourceId, id);
      } else if (type === "slayer") {
        const shooter = seats.find((s) => s.id === sourceId);
        if (!shooter) return;
        if (shooter.hasUsedSlayerAbility) {
          alert("该玩家已经使用过猎手能力了！");
          return;
        }
        if (shooter.isDead) {
          addLog(`${sourceId + 1}号已死亡无法开枪`);
          setCurrentModal({
            type: "SHOOT_RESULT",
            data: { message: "无事发生射手已死亡", isDemonDead: false },
          });
          return;
        }
        setCurrentModal({
          type: "SLAYER_SELECT_TARGET",
          data: { shooterId: sourceId },
        });
        return;
      } else if (type === "lunaticKill") {
        saveHistory();
        const killer = seats.find((s) => s.id === sourceId);
        if (!killer || killer.role?.id !== "psychopath") return;
        if (hasUsedDailyAbility("psychopath", sourceId)) {
          addLog(
            `${sourceId + 1}号(精神病患者) 尝试再次使用日杀能力但本局每名精神病患者只能日杀一次当前已用完`
          );
          setCurrentModal({
            type: "EXECUTION_RESULT",
            data: { message: "精神病患者每局只能日杀一次当前已用完" },
          });
          return;
        }
        const target = seats.find((s) => s.id === id);
        if (!target) return;
        if (target.isDead) {
          addLog(
            `${sourceId + 1}号(精神病患者) 试图在白天杀死 ${id + 1}号，但对方已死亡`
          );
          setCurrentModal({
            type: "EXECUTION_RESULT",
            data: { message: `${id + 1}号已死亡，未产生新的死亡` },
          });
        } else {
          setVfxTrigger({ seatId: id, type: "slayer" });
          setTimeout(() => setVfxTrigger(null), 1000);

          addLog(`${sourceId + 1}号(精神病患者) 在提名前公开杀死 ${id + 1}号`);
          killPlayer(id);
        }
        markDailyAbilityUsed("psychopath", sourceId);
        addLog("精神病患者本局的日间击杀能力已经使用完毕，之后不能再发动");
      }
    },
    [
      currentModal,
      seats,
      saveHistory,
      hasUsedDailyAbility,
      markDailyAbilityUsed,
      executeNomination,
      addLog,
      setCurrentModal,
      killPlayer,
      setVfxTrigger,
    ]
  );

  const handleDrunkCharadeSelect = useCallback(
    (selectedCharadeRoleId: string) => {
      const targetSeat =
        (currentModal?.type === "DRUNK_CHARADE_SELECT" &&
        currentModal.data?.seatId !== undefined
          ? seats.find((s) => s.id === currentModal.data.seatId)
          : null) ||
        seats.find(
          (s) =>
            (s.role?.id === "drunk" || s.role?.id === "marionette") &&
            !s.charadeRole
        );
      if (!targetSeat) {
        addLog("[handleDrunkCharadeSelect] 未找到需要设置伪装身份的座位");
        setCurrentModal(null);
        continueToNextAction();
        return;
      }

      const selectedRole = roles.find((r) => r.id === selectedCharadeRoleId);
      if (!selectedRole) {
        alert("选择的伪装身份无效，请重试。");
        setCurrentModal(null);
        return;
      }

      setSeats((prevSeats) =>
        prevSeats.map((s) => {
          if (s.id === targetSeat.id) {
            const roleName = s.role?.name || "角色";
            addLog(
              `为 ${s.id + 1}号 ${roleName} 设置伪装身份：${selectedRole.name}`
            );
            return {
              ...s,
              charadeRole: selectedRole,
              displayRole: selectedRole,
              isDrunk: s.role?.id === "drunk" ? true : s.isDrunk,
            };
          }
          return s;
        })
      );
      setCurrentModal(null);

      if (gamePhase === "setup" || gamePhase === "check") {
        proceedToFirstNight(roles);
      } else {
        continueToNextAction();
      }
    },
    [
      seats,
      roles,
      gamePhase,
      setSeats,
      setCurrentModal,
      addLog,
      continueToNextAction,
      proceedToFirstNight,
      (currentModal?.data as any)?.seatId,
      currentModal?.type,
    ]
  );

  const registerVotes = useCallback(
    (seatIds: number[]) => {
      setVotedThisRound(seatIds);
    },
    [setVotedThisRound]
  );

  const handleDayAbilityTrigger = useCallback(
    (seat: Seat, config: DayAbilityConfig) => {
      if (!seat.role || seat.isDead) return;
      if (config.usage === "once" && hasUsedAbility(config.roleId, seat.id))
        return;
      if (
        config.usage === "daily" &&
        hasUsedDailyAbility(config.roleId, seat.id)
      )
        return;
      saveHistory();
      if (config.actionType === "lunaticKill") {
        setCurrentModal({
          type: "DAY_ACTION",
          data: { type: "lunaticKill", sourceId: seat.id },
        });
        return;
      }
      if (
        ["savant_mr", "amnesiac", "fisherman", "engineer", "gossip"].includes(
          config.roleId
        )
      ) {
        setCurrentModal({
          type: "DAY_ABILITY",
          data: { roleId: config.roleId, seatId: seat.id },
        });
        setDayAbilityForm({});
        return;
      }
      addLog(config.logMessage(seat));
      if (config.usage === "once") {
        markAbilityUsed(config.roleId, seat.id);
      } else {
        markDailyAbilityUsed(config.roleId, seat.id);
      }
    },
    [
      hasUsedAbility,
      hasUsedDailyAbility,
      saveHistory,
      markAbilityUsed,
      markDailyAbilityUsed,
      addLog,
      setCurrentModal,
      setDayAbilityForm,
    ]
  );

  const handleViewDayAbilityResult = useCallback(
    (sourceSeatId: number) => {
      const sourceSeat = seats.find((s) => s.id === sourceSeatId);
      if (!sourceSeat || !sourceSeat.role) return;

      const isCharade =
        sourceSeat.role.id === "drunk" || sourceSeat.role.id === "marionette";
      const effectiveRole = isCharade
        ? sourceSeat.charadeRole || sourceSeat.role
        : sourceSeat.role;
      const displayRoleName =
        isCharade && sourceSeat.charadeRole
          ? sourceSeat.charadeRole.name
          : sourceSeat.role?.name || "";

      // 1. 如果有明确保存的结构化 dayAbilityResult
      if ((sourceSeat as any).dayAbilityResult) {
        const res = (sourceSeat as any).dayAbilityResult;
        if (res.type === "SHOOT_RESULT") {
          const phaseText = res.phaseText || "白天阶段";
          const targetId = res.targetId;
          const detail =
            res.detail ||
            `${phaseText}${
              targetId !== undefined && targetId !== null
                ? `向【${targetId + 1}号】玩家开枪，`
                : ""
            }结果：`;
          setCurrentModal({
            type: "SHOOT_RESULT",
            data: {
              message: res.message || "无事发生",
              isDemonDead: !!res.isDemonDead,
              targetId: res.targetId,
              shooterId: sourceSeatId,
              phaseText,
              detail,
            },
          });
          return;
        }
        if (res.type === "ARTIST_RESULT" && res.result) {
          showAlert(res.result, "🎨 艺术家技能结果");
          return;
        }
        if (res.type === "SAVANT_RESULT" && (res.infoA || res.infoB)) {
          showAlert(
            `博学者获得信息：\n1. ${res.infoA || "（无）"}\n2. ${res.infoB || "（无）"}`,
            "📜 博学者技能结果"
          );
          return;
        }
        if (res.type === "JUGGLER_JUDGE" || res.correctCount !== undefined) {
          showAlert(
            `杂耍艺人公开猜测结果：\n得知的数字为 ${res.correctCount ?? 0}（猜对 ${res.correctCount ?? 0} 个角色）`,
            "🤹 杂耍艺人技能结果"
          );
          return;
        }
        if (res.message || res.summary) {
          showAlert(res.message || res.summary, `${displayRoleName} 技能结果`);
          return;
        }
      }

      // 2. 猎手默认回退展示
      if (effectiveRole?.id === "slayer") {
        setCurrentModal({
          type: "SHOOT_RESULT",
          data: {
            message: "无事发生",
            isDemonDead: false,
            detail: "白天阶段向玩家开枪，结果：",
          },
        });
        return;
      }

      // 3. 通用提示
      showAlert(
        `${sourceSeatId + 1}号【${displayRoleName}】的技能已在白天发动完毕。`,
        `${displayRoleName} 技能结果`
      );
    },
    [seats, setCurrentModal]
  );

  const handleDayAbility = useCallback(
    (sourceSeatId: number, targetSeatId?: number) => {
      const sourceSeat = seats.find((s) => s.id === sourceSeatId);
      if (!sourceSeat || !sourceSeat.role) return;

      const isCharade =
        sourceSeat.role.id === "drunk" || sourceSeat.role.id === "marionette";
      const effectiveRole = isCharade
        ? sourceSeat.charadeRole || sourceSeat.role
        : sourceSeat.role;
      if (!effectiveRole) return;

      // ── 艺术家专用 ────────────────────────────────────
      if (effectiveRole.id === "artist") {
        if (sourceSeat.hasUsedDayAbility) {
          handleViewDayAbilityResult(sourceSeatId);
          return;
        }
        setSeats((prev) =>
          prev.map((s) =>
            s.id === sourceSeatId ? { ...s, hasUsedDayAbility: true } : s
          )
        );
        setCurrentModal({ type: "ARTIST_RESULT", data: { result: "" } });
        return;
      }

      // ── 博学者专用 ────────────────────────────────────
      if (effectiveRole.id === "savant") {
        setCurrentModal({
          type: "SAVANT_RESULT",
          data: { infoA: "", infoB: "" },
        });
        return;
      }

      // ── 赌徒专用：说书人判定猜测真假 ────────────────
      if (effectiveRole.id === "gambler") {
        if (sourceSeat.hasUsedDayAbility) {
          handleViewDayAbilityResult(sourceSeatId);
          return;
        }
        setSeats((prev) =>
          prev.map((s) =>
            s.id === sourceSeatId ? { ...s, hasUsedDayAbility: true } : s
          )
        );
        setCurrentModal({
          type: "GAMBLER_JUDGE",
          data: { seatId: sourceSeatId },
        });
        return;
      }

      // ── 杂耍艺人专用：说书人核对座位角色并记录猜对次数 ────────────────
      if (effectiveRole.id === "juggler") {
        if (sourceSeat.hasUsedDayAbility) {
          handleViewDayAbilityResult(sourceSeatId);
          return;
        }
        setCurrentModal({
          type: "JUGGLER_JUDGE",
          data: { seatId: sourceSeatId },
        });
        return;
      }

      // ── 包含模态弹窗的日间能力（如造谣者/失忆者/渔夫/技师等） ─────
      if (
        ["savant_mr", "amnesiac", "fisherman", "engineer", "gossip"].includes(
          effectiveRole.id
        )
      ) {
        if (
          (sourceSeat.hasUsedDayAbility ||
            (effectiveRole.id === "slayer" &&
              sourceSeat.hasUsedSlayerAbility)) &&
          effectiveRole.id !== "savant_mr"
        ) {
          handleViewDayAbilityResult(sourceSeatId);
          return;
        }
        setCurrentModal({
          type: "DAY_ABILITY",
          data: { roleId: effectiveRole.id, seatId: sourceSeatId },
        });
        setDayAbilityForm({});
        return;
      }

      const modularHandler = getRoleDefinition(effectiveRole.id);
      if (modularHandler?.day) {
        if (
          (sourceSeat.hasUsedDayAbility ||
            (effectiveRole.id === "slayer" &&
              sourceSeat.hasUsedSlayerAbility)) &&
          modularHandler.day.maxUses !== "infinity"
        ) {
          handleViewDayAbilityResult(sourceSeatId);
          return;
        }

        const dayContext: DayActionContext = {
          seats,
          selfId: sourceSeatId,
          targets: targetSeatId !== undefined ? [targetSeatId] : [],
          gamePhase,
          roles,
          killPlayer,
        };

        const result = modularHandler.day.handler?.(dayContext);

        // 有 handler → 使用 handler 结果
        if (result) {
          if (result.updates.length > 0) {
            const refreshedSeats = seats.map((s) => {
              const update = result.updates.find(
                (upd: { id: number }) => upd.id === s.id
              );
              return update ? { ...s, ...update } : s;
            });

            setSeats((prev) =>
              prev.map((s) => {
                const update = result.updates.find(
                  (upd: { id: number }) => upd.id === s.id
                );
                return update ? { ...s, ...update } : s;
              })
            );

            // Trigger game over check if state changed
            checkGameOver(refreshedSeats);
          }

          // 仅当没有后续交互弹窗时，直接在此处标记已使用；如果有交互弹窗 (result.modal)，由弹窗确认回调负责在真正触发确认时才标记已使用
          if (modularHandler.day.maxUses !== "infinity" && !result.modal) {
            setSeats((prev) =>
              prev.map((s) =>
                s.id === sourceSeatId
                  ? {
                      ...s,
                      hasUsedDayAbility: true,
                      hasUsedSlayerAbility:
                        effectiveRole.id === "slayer"
                          ? true
                          : s.hasUsedSlayerAbility,
                    }
                  : s
              )
            );
          }

          if (!result.modal) {
            if (result.logs.privateLog) addLog(result.logs.privateLog);
            if (result.logs.publicLog) addLog(result.logs.publicLog);
          }

          if (result.modal) {
            setCurrentModal(result.modal);
          }

          return;
        }

        // 无 handler → 通用回退：标记已使用 + 说书人提示
        if (modularHandler.day.maxUses !== "infinity") {
          setSeats((prev) =>
            prev.map((s) =>
              s.id === sourceSeatId
                ? {
                    ...s,
                    hasUsedDayAbility: true,
                    hasUsedSlayerAbility:
                      effectiveRole.id === "slayer"
                        ? true
                        : s.hasUsedSlayerAbility,
                  }
                : s
            )
          );
        }
        addLog(
          `${sourceSeatId + 1}号 [${effectiveRole.name}${sourceSeat.role?.id === "drunk" ? " (酒鬼)" : ""}] 发动技能`
        );
        return;
      }

      if (!effectiveRole.dayMeta) {
        return;
      }

      if (sourceSeat.hasUsedDayAbility) {
        alert("此玩家已经使用过技能了！");
        return;
      }

      const meta = effectiveRole.dayMeta;
      let logMessage = `${sourceSeatId + 1}号 [${effectiveRole.name}${sourceSeat.role?.id === "drunk" ? " (酒鬼)" : ""}] 发动技能`;

      saveHistory();

      setSeats((prev) =>
        prev.map((s) =>
          s.id === sourceSeatId
            ? {
                ...s,
                hasUsedDayAbility: true,
                hasUsedSlayerAbility:
                  effectiveRole.id === "slayer" ? true : s.hasUsedSlayerAbility,
              }
            : s
        )
      );

      if (meta.effectType === "slayer_check" && targetSeatId !== undefined) {
        const targetSeat = seats.find((s) => s.id === targetSeatId);
        logMessage += ` 射击了 ${targetSeatId + 1}号`;

        if (!targetSeat) {
          logMessage += " -> ❌ 目标不存在";
          addLog(logMessage);
          alert("❌ 目标座位不存在");
          return;
        }

        if (targetSeat.isDead) {
          logMessage += " -> 💨 未命中 (目标已死亡)";
          addLog(logMessage);
          alert("💨 杀手射击失败。\n目标已死亡。");
          return;
        }

        const targetRole = targetSeat.role;
        // 官方规则：如果目标是恶魔、恶魔继承者、或注册为恶魔的陌客（陌客默认注册为恶魔）
        const isDemon =
          targetRole?.type === "demon" ||
          targetSeat.isDemonSuccessor ||
          (targetRole?.id === "recluse" &&
            (targetSeat as any).registerAsDemon !== false &&
            (targetSeat as any).registerAsEvil !== false) ||
          (targetRole?.id === "spy" &&
            (targetSeat as any).registerAsDemon === true);
        const isRealSlayer =
          sourceSeat.role?.id === "slayer" &&
          !sourceSeat.isDrunk &&
          !sourceSeat.isPoisoned &&
          !isActorDisabledByPoisonOrDrunk(sourceSeat);

        if (isDemon && isRealSlayer) {
          killPlayer(targetSeatId, {
            skipGameOverCheck: false,
            onAfterKill: () => {
              logMessage += " -> 🎯 命中！恶魔死亡！";
              addLog(logMessage);

              // 检查是否有红唇女郎继任（死前≥5人存活，即幸存≥4人）
              const aliveCount = seats.filter(
                (s) =>
                  !s.isDead &&
                  s.id !== targetSeatId &&
                  s.role?.type !== "traveler"
              ).length;
              const hasScarletWomanSuccessor = seats.some(
                (s) =>
                  s.role?.id === "scarlet_woman" &&
                  !s.isDead &&
                  !s.isDrunk &&
                  !s.isPoisoned &&
                  aliveCount >= 4
              );

              if (!hasScarletWomanSuccessor) {
                addLog("猎手的子弹击中了恶魔，善良阵营获胜！");
                setWinReason("猎手击杀恶魔");
              } else {
                addLog(
                  "猎手的子弹击中了恶魔，但红唇女郎（存活≥4人）继承为新的恶魔，游戏继续！"
                );
              }
              alert(
                `🎯 杀手射击成功！\n${targetSeatId + 1}号 [${targetRole?.name || "未知"}] 死亡！`
              );
            },
          });
        } else {
          if (
            sourceSeat.role?.id === "drunk" ||
            isActorDisabledByPoisonOrDrunk(sourceSeat)
          ) {
            logMessage += ` -> 💨 未命中 (${sourceSeat.role?.id === "drunk" ? "酒鬼" : "中毒/醉酒"}能力失效)`;
          } else {
            logMessage += " -> 💨 未命中 (目标不是恶魔)";
          }
          addLog(logMessage);
          alert(`💨 杀手射击未生效。\n${targetSeatId + 1}号未死亡。`);
        }
      } else if (meta.effectType === "kill" && targetSeatId !== undefined) {
        const targetSeat = seats.find((s) => s.id === targetSeatId);
        if (targetSeat) {
          logMessage += ` 对 ${targetSeatId + 1}号使用`;
          killPlayer(targetSeatId);
          addLog(logMessage);
        }
      } else if (meta.effectType === "transform_ability") {
        if (sourceSeat.role?.id === "philosopher") {
          setCurrentModal({
            type: "ROLE_SELECT",
            data: {
              type: "philosopher",
              targetId: sourceSeatId,
              onConfirm: (roleId: string) => {
                if (isAntagonismEnabled(seats)) {
                  const decision = checkCannotGainAbility({
                    seats,
                    gainerRoleId: sourceSeat.role?.id || "unknown",
                    abilityRoleId: roleId,
                    roles,
                  });
                  if (!decision.allowed) {
                    alert(decision.reason);
                    addLog(`⛔ ${decision.reason}（哲学家本次使用视作已消耗）`);
                    return;
                  }
                }

                changeRole(sourceSeatId, roleId, roles);
                logMessage += ` 获得了 [${roles.find((r) => r.id === roleId)?.name || roleId}] 的能力`;
                addLog(logMessage);
              },
            },
          });
        } else {
          alert("🧠 变身逻辑待UI配合 (需选择角色列表)");
        }
      } else {
        addLog(logMessage);
      }
    },
    [
      seats,
      saveHistory,
      killPlayer,
      setSeats,
      addLog,
      setWinReason,
      changeRole,
      roles,
      setCurrentModal,
      checkGameOver,
      gamePhase,
      handleViewDayAbilityResult,
      isActorDisabledByPoisonOrDrunk,
      setDayAbilityForm,
    ]
  );

  return useMemo(
    () => ({
      executeNomination,
      cancelNomination,
      handleVirginGuideConfirm,
      handleDayAction,
      handleDrunkCharadeSelect,
      registerVotes,
      handleDayAbilityTrigger,
      handleDayAbility,
      handleViewDayAbilityResult,
    }),
    [
      executeNomination,
      cancelNomination,
      handleVirginGuideConfirm,
      handleDayAction,
      handleDrunkCharadeSelect,
      registerVotes,
      handleDayAbilityTrigger,
      handleDayAbility,
      handleViewDayAbilityResult,
    ]
  );
}
