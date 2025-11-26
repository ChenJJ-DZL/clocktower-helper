"use client";

import { useState, useEffect, useRef } from "react";
import { roles, Role, RoleType } from "./data";
import html2canvas from 'html2canvas';

// --- 1. 类型定义 ---
type GamePhase = "setup" | "check" | "firstNight" | "day" | "night" | "dawnReport" | "gameOver";
type WinResult = "good" | "evil" | null;

interface Seat {
  id: number;
  role: Role | null;
  charadeRole: Role | null; // 酒鬼伪装
  isDead: boolean;
  isDrunk: boolean;
  isPoisoned: boolean;
  isProtected: boolean;
  isRedHerring: boolean;
  isSentenced: boolean; // 待处决
  masterId: number | null;
  hasUsedSlayerAbility: boolean;
  hasUsedVirginAbility: boolean; // 圣女技能是否已用
  isDemonSuccessor: boolean; // 猩红女巫继任
  statusDetails: string[]; 
}

interface LogEntry {
  day: number;
  phase: string;
  message: string;
}

interface GameHistory {
    date: string;
    logs: LogEntry[];
    finalSeats: Seat[];
    result: WinResult;
}

interface NightHintState {
    isPoisoned: boolean;
    reason?: string;
    realHint: string;
    fakeHint?: string;
}

// --- 2. 工具函数 ---
const formatTime = (date: Date) => {
    return date.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(/\//g, '-');
};

function getSeatPosition(index: number, total: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const radius = 45; // 适配15人布局
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return { x: x.toFixed(2), y: y.toFixed(2) };
}

// --- 3. 主组件 ---
export default function Home() {
  // 状态定义
  const [seats, setSeats] = useState<Seat[]>(
    Array.from({ length: 15 }, (_, i) => ({ 
      id: i, role: null, charadeRole: null, 
      isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, 
      isRedHerring: false, isSentenced: false, masterId: null, 
      hasUsedSlayerAbility: false, hasUsedVirginAbility: false, isDemonSuccessor: false,
      statusDetails: []
    }))
  );
  const [initialSeats, setInitialSeats] = useState<Seat[]>([]);
  
  const [gamePhase, setGamePhase] = useState<GamePhase>("setup");
  const [nightCount, setNightCount] = useState(1);
  const [deadThisNight, setDeadThisNight] = useState<string[]>([]);
  const [executedPlayerId, setExecutedPlayerId] = useState<number | null>(null);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
  const [archivedHistory, setArchivedHistory] = useState<GameHistory[]>([]);
  const [winResult, setWinResult] = useState<WinResult>(null);
  const [virginAbilityUsed, setVirginAbilityUsed] = useState(false);
  
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; seatId: number } | null>(null);
  const [statusModalSeat, setStatusModalSeat] = useState<Seat | null>(null);
  
  const [wakeQueue, setWakeQueue] = useState<Seat[]>([]);
  const [currentWakeIndex, setCurrentWakeIndex] = useState(0);
  const [currentHint, setCurrentHint] = useState<NightHintState>({ isPoisoned: false, realHint: "" });
  const [selectedActionTargets, setSelectedActionTargets] = useState<number[]>([]);
  const [inspectionResult, setInspectionResult] = useState<string | null>(null);
  
  // 弹窗控制
  const [showShootModal, setShowShootModal] = useState<number | null>(null);
  const [showNominateModal, setShowNominateModal] = useState<number | null>(null);
  const [showDayActionModal, setShowDayActionModal] = useState<{type: 'slayer'|'nominate', sourceId: number} | null>(null);
  const [showDrunkModal, setShowDrunkModal] = useState<number | null>(null);
  const [showVirginTriggerModal, setShowVirginTriggerModal] = useState<{source: Seat, target: Seat} | null>(null);
  const [showRavenkeeperFakeModal, setShowRavenkeeperFakeModal] = useState<number | null>(null);
  
  const [showMenu, setShowMenu] = useState(false);
  const [showRoleCard, setShowRoleCard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const seatsRef = useRef(seats);
  useEffect(() => { seatsRef.current = seats; }, [seats]);
  const reportRef = useRef<HTMLDivElement>(null);

  const groupedRoles = roles.reduce((acc, role) => {
    if (!acc[role.type]) acc[role.type] = [];
    acc[role.type].push(role);
    return acc;
  }, {} as Record<string, Role[]>);

  const typeLabels: Record<string, string> = { townsfolk: "村民", outsider: "外来者", minion: "爪牙", demon: "恶魔" };
  const typeColors: Record<string, string> = { townsfolk: "bg-blue-600", outsider: "bg-purple-600", minion: "bg-red-600", demon: "bg-red-800" };
  const textColors: Record<string, string> = { townsfolk: "text-blue-400", outsider: "text-purple-400", minion: "text-red-500", demon: "text-red-600" };

  // --- 4. 逻辑函数 ---

  const addLog = (message: string, overridePhase?: string) => {
    setGameLogs(prev => [...prev, { day: nightCount, phase: overridePhase || gamePhase, message }]);
  };

  const checkGameOver = (currentSeats: Seat[]) => {
    const alivePlayers = currentSeats.filter(s => !s.isDead);
    const aliveDemon = currentSeats.find(s => (s.role?.type === "demon" || s.isDemonSuccessor) && !s.isDead);
    
    if (!aliveDemon) {
        const scarletWoman = currentSeats.find(s => s.role?.id === "scarlet_woman" && !s.isDead);
        if (scarletWoman && alivePlayers.length >= 5) {
            addLog("👿 【猩红女巫】触发！继承恶魔之力，游戏继续。", "night");
            const newSeats = currentSeats.map(s => s.id === scarletWoman.id ? { ...s, isDemonSuccessor: true, statusDetails: [...s.statusDetails, "已继任恶魔"] } : s);
            setSeats(newSeats);
            return;
        }
        setWinResult("good");
        setEndTime(new Date());
        setGamePhase("gameOver");
        return true;
    }

    if (alivePlayers.length <= 2) {
      setWinResult("evil");
      setEndTime(new Date());
      setGamePhase("gameOver");
      return true;
    }
    return false;
  };

  const executePlayer = (targetId: number) => {
      const target = seats.find(s => s.id === targetId);
      if (!target) return;

      addLog(`⚖️ 【处决】 ${target.id + 1}号 被投票处决！`);

      if (target.role?.id === "saint" && !target.isPoisoned && !target.isDrunk) {
          addLog(`😱 圣徒被处决！邪恶阵营直接获胜！`);
          setWinResult("evil");
          setEndTime(new Date());
          setGamePhase("gameOver");
          return;
      }

      const updatedSeats = seats.map(s => s.id === targetId ? { ...s, isDead: true, isSentenced: false } : { ...s, isSentenced: false });
      setSeats(updatedSeats);
      
      const isGameOver = checkGameOver(updatedSeats);
      
      if (!isGameOver) {
          alert(`${target.id + 1}号 已被处决。\n天黑请闭眼！`);
          startNight(false);
      }
  };

  const calculateHint = (targetSeat: Seat, phase: GamePhase) => {
    const currentAllSeats = seatsRef.current; 
    const latestTargetSeat = currentAllSeats.find(s => s.id === targetSeat.id) || targetSeat;
    const effectiveRole = latestTargetSeat.role?.id === "drunk" ? latestTargetSeat.charadeRole : latestTargetSeat.role;
    
    if (!effectiveRole) return;
    setInspectionResult(null);

    const isPoisonedOrDrunk = latestTargetSeat.isPoisoned || latestTargetSeat.isDrunk || latestTargetSeat.role?.id === "drunk";
    const reason = latestTargetSeat.isPoisoned ? "中毒" : "酒鬼";

    let realHint = "";
    let fakeHint = "";

    const getAlignment = (s: Seat) => {
      if (!s.role) return "neutral";
      if (s.isRedHerring) return "evil";
      if (s.role.id === "recluse") return Math.random() < 0.3 ? "evil" : "good";
      if (s.role.id === "spy") return Math.random() < 0.3 ? "good" : "evil";
      return ["minion", "demon"].includes(s.role.type) || s.isDemonSuccessor ? "evil" : "good";
    };
    const isMinionOrDemon = (s: Seat) => getAlignment(s) === "evil";
    const isTownsfolk = (s: Seat) => s.role?.type === "townsfolk";
    const isOutsider = (s: Seat) => s.role?.type === "outsider";
    const isMinion = (s: Seat) => s.role?.type === "minion";

    if (effectiveRole.id === "empath") {
      const aliveSeats = currentAllSeats.filter(s => !s.isDead);
      const myIndex = aliveSeats.findIndex(s => s.id === latestTargetSeat.id);
      if (myIndex !== -1) {
        const prev = aliveSeats[(myIndex - 1 + aliveSeats.length) % aliveSeats.length];
        const next = aliveSeats[(myIndex + 1) % aliveSeats.length];
        let count = 0;
        if (isMinionOrDemon(prev)) count++;
        if (isMinionOrDemon(next)) count++;
        realHint = `邻居 [${prev.id + 1}号] 和 [${next.id + 1}号]。侦测到 ${count} 个邪恶。`;
        const fakeCount = count === 0 ? 1 : (count === 2 ? 1 : (Math.random() < 0.5 ? 0 : 2));
        fakeHint = `邻居 [${prev.id + 1}号] 和 [${next.id + 1}号]。侦测到 ${fakeCount} 个邪恶。`;
      }
    } 
    else if (effectiveRole.id === "chef" && phase === "firstNight") {
      let pairs = 0;
      for (let i = 0; i < currentAllSeats.length; i++) {
        const current = currentAllSeats[i];
        const next = currentAllSeats[(i + 1) % currentAllSeats.length];
        if (isMinionOrDemon(current) && isMinionOrDemon(next)) pairs++;
      }
      realHint = `场上共有 ${pairs} 对邪恶玩家相邻。`;
      const fakePairs = pairs === 0 ? 1 : (Math.random() < 0.5 ? pairs - 1 : pairs + 1);
      fakeHint = `场上共有 ${Math.max(0, fakePairs)} 对邪恶玩家相邻。`;
    }
    else if (["washerwoman", "librarian", "investigator"].includes(effectiveRole.id) && phase === "firstNight") {
      let targetType = "";
      if (effectiveRole.id === "washerwoman") targetType = "townsfolk";
      if (effectiveRole.id === "librarian") targetType = "outsider";
      if (effectiveRole.id === "investigator") targetType = "minion";
      
      const targetPool = currentAllSeats.filter(s => s.role?.type === targetType && s.id !== latestTargetSeat.id);

      if (targetPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * targetPool.length);
        const realTarget = targetPool[randomIndex];
        const decoys = currentAllSeats.filter(s => s.id !== realTarget.id && s.id !== latestTargetSeat.id);
        const decoy = decoys[Math.floor(Math.random() * decoys.length)];
        
        realHint = `展示【${typeLabels[targetType]} - ${realTarget.role?.name}】。\n指向 [${realTarget.id + 1}号] 和 [${decoy?.id + 1 || '?'}号]。`;
        
        if (isPoisonedOrDrunk) {
            const potentialFakeRoles = groupedRoles[targetType] || [];
            const fakeRole = potentialFakeRoles.length > 0 ? potentialFakeRoles[Math.floor(Math.random() * potentialFakeRoles.length)] : roles[0];
            const f1 = decoys[Math.floor(Math.random() * decoys.length)];
            const f2 = decoys.filter(d=>d.id!==f1.id)[0] || f1;
            fakeHint = `展示【${typeLabels[targetType]} - ${fakeRole.name}】。\n指向 [${f1.id + 1}号] 和 [${f2.id + 1}号]。`;
        }
      } else {
        realHint = `场上无此阵营角色，显示0。`;
        fakeHint = `场上无此阵营，但显示 1 或 2。`;
      }
    }
    else if (effectiveRole.id === "fortune_teller") {
        realHint = "查验两名玩家 (含恶魔/红罗刹为是)。";
        fakeHint = "查验两名玩家，随意点头或摇头。";
    } 
    else if (effectiveRole.id === "undertaker") {
        const executedPlayer = executedPlayerId !== null ? currentAllSeats.find(s => s.id === executedPlayerId) : null;
        if (executedPlayer) {
            realHint = `今天被处决的是 [${executedPlayer.id + 1}号]，角色是【${executedPlayer.role?.name}】。`;
            const deadRoles = currentAllSeats.filter(s => s.isDead).map(s => s.role?.name);
            const fakeRoleName = deadRoles.length > 0 ? deadRoles[Math.floor(Math.random() * deadRoles.length)] : "未知道具";
            fakeHint = `今天被处决的是 [${executedPlayer.id + 1}号]，角色是【${fakeRoleName}】(假)。`;
        } else {
            realHint = "今天没有人被处决。";
            fakeHint = "显示任意一名玩家的角色牌。";
        }
    }
    else if (effectiveRole.id === "ravenkeeper") {
        if (!latestTargetSeat.isDead) {
            realHint = "你还活着，无法发动技能。";
            fakeHint = "假装查验，然后告知错误信息。";
        } else if (!deadThisNight.includes(latestTargetSeat.role?.name || "")) {
             realHint = "你不是今晚死亡的，无法发动技能。";
             fakeHint = "";
        } else {
             realHint = "选择一名玩家查验其身份。";
             fakeHint = "选择一名玩家，告知错误身份。";
        }
    }
    else {
        realHint = phase === "firstNight" ? (effectiveRole.firstNightReminder || "") : (effectiveRole.otherNightReminder || "");
        fakeHint = "提供无效信息。";
    }

    setCurrentHint({
        isPoisoned: isPoisonedOrDrunk,
        reason: reason,
        realHint: realHint,
        fakeHint: fakeHint
    });
  };

  // 监听唤醒
  const currentWakeSeat = wakeQueue[currentWakeIndex];
  useEffect(() => {
    if ((gamePhase === "firstNight" || gamePhase === "night") && currentWakeSeat) {
      calculateHint(currentWakeSeat, gamePhase);
      setSelectedActionTargets([]);
    }
  }, [currentWakeIndex, gamePhase, wakeQueue]);

  // --- 4. 流程控制 ---
  const assignRedHerring = (currentSeats: Seat[]) => {
    const goodPlayers = currentSeats.filter(s => s.role && ["townsfolk", "outsider"].includes(s.role.type));
    if (goodPlayers.length > 0) {
        const target = goodPlayers[Math.floor(Math.random() * goodPlayers.length)];
        return currentSeats.map(s => s.id === target.id ? { ...s, isRedHerring: true, statusDetails: [...s.statusDetails, "系统: 红罗刹"] } : s);
    }
    return currentSeats;
  };

  const handlePreStartNight = () => {
    const activeSeats = seats.filter(s => s.role !== null);
    if (activeSeats.length === 0) { alert("请先安排座位！"); return; }
    
    const unconfiguredDrunk = activeSeats.find(s => s.role?.id === "drunk" && !s.charadeRole);
    if (unconfiguredDrunk) {
        setShowDrunkModal(unconfiguredDrunk.id);
        return; 
    }

    const seatsWithRedHerring = assignRedHerring(activeSeats);
    setSeats(seatsWithRedHerring);
    setInitialSeats(JSON.parse(JSON.stringify(seatsWithRedHerring)));
    setGamePhase("check");
  };

  const confirmDrunkCharade = (charadeRole: Role) => {
      if (showDrunkModal === null) return;
      setSeats(prev => prev.map(s => s.id === showDrunkModal ? { 
          ...s, charadeRole: charadeRole, isDrunk: true, statusDetails: [...s.statusDetails, `酒鬼伪装: ${charadeRole.name}`]
      } : s));
      setShowDrunkModal(null);
      setTimeout(handlePreStartNight, 100); 
  };

  const startNight = (isFirst: boolean) => {
    if (isFirst) setStartTime(new Date());
    if (!isFirst) setExecutedPlayerId(null);

    const activeSeats = seats.filter(s => s.role !== null);
    const newSeats = seats.map(s => ({ 
      ...s, isPoisoned: false, isProtected: false, masterId: null,
      statusDetails: s.statusDetails.filter(d => d.includes("红罗刹") || d.includes("酒鬼") || d.includes("杀手"))
    }));
    setSeats(newSeats);
    setDeadThisNight([]);

    const queue = activeSeats
      .filter(s => {
          if (s.role?.id === 'ravenkeeper') return true;
          return !s.isDead;
      })
      .filter(s => {
        const effectiveRole = s.role?.id === "drunk" ? s.charadeRole : s.role;
        const order = isFirst ? (effectiveRole?.firstNightOrder || 0) : (effectiveRole?.otherNightOrder || 0);
        return order > 0;
      })
      .sort((a, b) => {
        const roleA = a.role?.id === "drunk" ? a.charadeRole : a.role;
        const roleB = b.role?.id === "drunk" ? b.charadeRole : b.role;
        const orderA = isFirst ? (roleA?.firstNightOrder || 0) : (roleA?.otherNightOrder || 0);
        const orderB = isFirst ? (roleB?.firstNightOrder || 0) : (roleB?.otherNightOrder || 0);
        return orderA - orderB;
      });

    setWakeQueue(queue);
    setCurrentWakeIndex(0);
    setGamePhase(isFirst ? "firstNight" : "night");
    if (!isFirst) setNightCount(prev => prev + 1);
    addLog(`=== 第 ${isFirst ? 1 : nightCount + 1} 夜 ===`);
  };

  // --- 5. 动作处理 ---
  const handleDayAction = (targetId: number) => {
      if (showDayActionModal) {
          const { type, sourceId } = showDayActionModal;
          const source = seats.find(s => s.id === sourceId);
          const target = seats.find(s => s.id === targetId);
          setShowDayActionModal(null);
          
          if (!source || !target) return;

          // 提名逻辑
          if (type === 'nominate') {
              addLog(`🗣️ ${sourceId + 1}号 提名了 ${targetId + 1}号`, "day");
              if (target.role?.id === "virgin" && !target.isPoisoned && !target.isDrunk && !target.isDead && !virginAbilityUsed && source.role?.type === "townsfolk") {
                  setShowVirginTriggerModal({ source, target });
                  return;
              }
              if (confirm(`${targetId + 1}号 被提名。\n票数足够请将其【上刑头】。\n是否标记为【待处决】？`)) {
                  setSeats(prev => prev.map(s => s.id === targetId ? { ...s, isSentenced: true } : { ...s, isSentenced: false }));
              }
          }
          // 开枪逻辑
          else if (type === 'slayer') {
              const isRealSlayer = source.role?.id === "slayer";
              const isSoberAndHealthy = !source.isPoisoned && !source.isDrunk && !source.isDead;
              const hasNotUsedAbility = !source.hasUsedSlayerAbility;
              const isDemon = target.role?.type === "demon" || target.isDemonSuccessor;

              if (isRealSlayer && isSoberAndHealthy && hasNotUsedAbility) {
                  let updatedSeats = seats.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true, statusDetails: [...s.statusDetails, "杀手技能已用"] } : s);
                  if (isDemon) {
                      addLog(`🔫💥 【杀手击杀】${source.id+1}号 射杀了 ${target.id+1}号(恶魔)！`, "day");
                      updatedSeats = updatedSeats.map(s => s.id === targetId ? { ...s, isDead: true } : s);
                      setSeats(updatedSeats);
                      checkGameOver(updatedSeats); 
                  } else {
                      addLog(`🔫 杀手向 ${target.id+1}号 开枪，无事发生。`, "day");
                      setSeats(updatedSeats);
                  }
              } else {
                  addLog(`🔫 (假装) ${source.id+1}号 向 ${target.id+1}号 开枪。`, "day");
              }
          }
      }
  };

  const confirmVirginTrigger = () => {
      if (!showVirginTriggerModal) return;
      const { source } = showVirginTriggerModal;
      
      addLog(`✨ 圣女技能触发！${source.id + 1}号 (提名者) 被立即处决！`);
      setVirginAbilityUsed(true);
      
      const updatedSeats = seats.map(s => s.id === source.id ? { ...s, isDead: true } : s);
      setSeats(updatedSeats);
      setShowVirginTriggerModal(null);

      setTimeout(() => {
          alert("圣女技能触发，白天结束，进入夜晚！");
          startNight(false);
      }, 500);
  };

  const confirmRavenkeeperFake = (fakeRole: Role) => {
      setInspectionResult(`(中毒干扰) 请告诉他：该玩家是【${fakeRole.name}】`);
      setShowRavenkeeperFakeModal(null);
  };

  const handleConfirmAction = () => {
    if (!currentWakeSeat) return;
    const actionType = currentWakeSeat.role?.nightActionType;
    
    if (actionType === "inspect_death" && currentWakeSeat.role?.id === "ravenkeeper") {
        if (currentWakeSeat.isPoisoned || currentWakeSeat.isDrunk) {
            if (selectedActionTargets.length > 0) setShowRavenkeeperFakeModal(selectedActionTargets[0]);
            return;
        }
        if (selectedActionTargets.length > 0) {
            const target = seats.find(s => s.id === selectedActionTargets[0]);
            setInspectionResult(`真实身份：${target?.role?.name}`);
            return;
        }
    }

    if (actionType === "inspect" && currentWakeSeat.role?.id === "fortune_teller") {
        if (currentWakeSeat.isPoisoned || currentWakeSeat.isDrunk) {
            setInspectionResult("🎲 (中毒) 随意给结果");
        } else {
            const hasEvil = selectedActionTargets.some(id => {
                const target = seats.find(s => s.id === id);
                if (!target) return false;
                return target.role?.type === "demon" || target.isRedHerring || target.isDemonSuccessor;
            });
            setInspectionResult(hasEvil ? "✅ 是 (点头)" : "❌ 否 (摇头)");
        }
        return; 
    }

    if (selectedActionTargets.length > 0) {
      const targetId = selectedActionTargets[0];
      const targetName = `${targetId + 1}号`;

      setSeats(prevSeats => {
        return prevSeats.map(s => {
            if (s.id !== targetId) return s;

            if (actionType === "poison") {
                addLog(`投毒者 -> ${targetName} (中毒)`);
                return { ...s, isPoisoned: true, statusDetails: [...s.statusDetails, `第${nightCount}夜: 中毒`] };
            } 
            if (actionType === "protect") {
                addLog(`僧侣 -> ${targetName} (保护)`);
                return { ...s, isProtected: true, statusDetails: [...s.statusDetails, `第${nightCount}夜: 保护`] };
            }
            if (actionType === "mark" && currentWakeSeat.role?.id === "butler") {
                addLog(`管家 -> ${targetName} (主人)`);
                return { ...s, masterId: targetId };
            }
            if (actionType === "kill") {
                if (currentWakeSeat.role?.id === "imp" && gamePhase === "firstNight") return s;
                if (s.role?.id === "soldier" && !s.isPoisoned && !s.isDrunk) {
                    addLog(`恶魔攻击 ${targetName}(士兵)，免疫成功！`);
                    return s;
                }
                if (!s.isProtected) {
                    addLog(`恶魔 -> ${targetName} (死亡)`);
                    setDeadThisNight(prev => {
                        const name = s.role?.name || "未知";
                        return prev.includes(name) ? prev : [...prev, name];
                    });
                    return { ...s, isDead: true };
                } else {
                    addLog(`恶魔 -> ${targetName} (挡刀)`);
                }
            }
            return s;
        });
      });
    }
    handleNextWake();
  };

  const handleNextWake = () => {
    if (currentWakeIndex < wakeQueue.length - 1) {
      setCurrentWakeIndex(prev => prev + 1);
    } else {
      setGamePhase("dawnReport");
    }
  };

  const canUseSkill = () => {
      if (!currentWakeSeat || !currentWakeSeat.role?.nightActionType || currentWakeSeat.role.nightActionType === "none") return false;
      if (currentWakeSeat.role.id === "imp" && gamePhase === "firstNight") return false;
      return true;
  };

  const handleRestart = () => {
      if (confirm("确定要重新开始吗？当前进度将丢失。")) {
          const history: GameHistory = {
              date: new Date().toLocaleString(),
              logs: gameLogs,
              finalSeats: seats,
              result: winResult
          };
          setArchivedHistory(prev => [history, ...prev]);
          
          setSeats(Array.from({ length: 15 }, (_, i) => ({ 
              id: i, role: null, charadeRole: null, 
              isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, isRedHerring: false, 
              isSentenced: false, masterId: null, hasUsedSlayerAbility: false, hasUsedVirginAbility: false, isDemonSuccessor: false,
              statusDetails: []
          })));
          setGamePhase("setup");
          setNightCount(1);
          setDeadThisNight([]);
          setGameLogs([]);
          setWinResult(null);
          setVirginAbilityUsed(false);
          setShowMenu(false);
      }
  };

  const handleSeatClick = (seatId: number) => {
    if (gamePhase === "setup") {
      if (selectedRole) {
        setSeats(seats.map(s => s.id === seatId ? { ...s, role: selectedRole, charadeRole: null } : s));
        setSelectedRole(null);
      } else {
        setSeats(seats.map(s => s.id === seatId ? { ...s, role: null, charadeRole: null } : s));
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>, seatId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, seatId });
  };

  const toggleTarget = (id: number) => {
      const maxTargets = currentWakeSeat?.role?.id === "fortune_teller" ? 2 : 1;
      setSelectedActionTargets(prev => {
          if (prev.includes(id)) return prev.filter(t => t !== id);
          if (prev.length >= maxTargets) return [...prev.slice(1), id];
          return [...prev, id];
      });
  };

  const isTargetDisabled = (seat: Seat) => {
      if (!currentWakeSeat) return true;
      const roleId = currentWakeSeat.role?.id;
      if (roleId === 'monk' && seat.id === currentWakeSeat.id) return true;
      if (roleId === 'poisoner') {
          const isEvil = ['minion', 'demon'].includes(seat.role?.type || '');
          if (seat.isDead || isEvil) return true;
      }
      if (roleId === 'ravenkeeper' && !currentWakeSeat.isDead) return true;
      return false;
  };

  const toggleStatus = (type: 'dead' | 'drunk' | 'poison' | 'redherring') => {
    if (!contextMenu) return;
    const targetId = contextMenu.seatId;
    let newSeats = [...seats];

    newSeats = newSeats.map(s => {
      if (s.id === targetId) {
        if (type === 'dead') {
             const newState = !s.isDead;
             if (newState && gamePhase === 'day') {
                 if (confirm(`这是处决导致的死亡吗？\n(掘墓人将获知信息)`)) {
                     setExecutedPlayerId(s.id);
                     addLog(`${s.id + 1}号 被处决`);
                 } else {
                     addLog(`${s.id + 1}号 死亡`);
                 }
             } else {
                 addLog(`${s.id + 1}号 ${newState ? '死亡' : '复活'}`);
             }
             return { ...s, isDead: newState };
        }
        if (type === 'drunk') return { ...s, isDrunk: !s.isDrunk, statusDetails: !s.isDrunk ? [...s.statusDetails, "标记: 酒鬼"] : s.statusDetails.filter(d => !d.includes("酒鬼")) };
        if (type === 'poison') return { ...s, isPoisoned: !s.isPoisoned, statusDetails: !s.isPoisoned ? [...s.statusDetails, "标记: 中毒"] : s.statusDetails.filter(d => !d.includes("中毒")) };
        if (type === 'redherring') return { ...s, isRedHerring: !s.isRedHerring, statusDetails: !s.isRedHerring ? [...s.statusDetails, "标记: 红罗刹"] : s.statusDetails.filter(d => !d.includes("红罗刹")) };
      }
      return s;
    });
    setSeats(newSeats);
    setContextMenu(null);
    if (type === 'dead') checkGameOver(newSeats);
  };

  const exportImage = async () => {
    if (reportRef.current) {
        const complexElements = reportRef.current.querySelectorAll('.complex-bg-circle');
        complexElements.forEach(el => (el as HTMLElement).style.display = 'none');
        try {
            const canvas = await html2canvas(reportRef.current, { backgroundColor: "#111827", useCORS: true, scale: 2, logging: false });
            const image = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = image;
            link.download = `血染钟楼结算_${formatTime(new Date()).split(' ')[0]}.png`;
            link.click();
        } catch (e) { alert("导出失败"); } finally { complexElements.forEach(el => (el as HTMLElement).style.display = 'block'); }
    }
  };

  const getDuration = () => {
      if (!startTime || !endTime) return "未知";
      const diff = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);
      return `${diff} 分钟`;
  };

  // --- 6. 渲染 UI ---
  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden relative" onClick={() => { setContextMenu(null); setShowMenu(false); }}>
      
      {/* 顶部菜单 */}
      <div className="absolute top-4 right-4 z-[60]">
          <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 border border-gray-600">☰ 更多</button>
          {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl overflow-hidden">
                  <button onClick={() => setShowHistory(true)} className="w-full text-left px-4 py-3 hover:bg-gray-700 border-b border-gray-700">📜 游戏记录</button>
                  <button onClick={() => setShowRoleCard(true)} className="w-full text-left px-4 py-3 hover:bg-gray-700 border-b border-gray-700">🃏 角色图鉴</button>
                  <button onClick={handleRestart} className="w-full text-left px-4 py-3 hover:bg-gray-700 text-red-400">🔄 重新开始</button>
              </div>
          )}
      </div>

      {/* 侧边栏 */}
      <div className="w-1/4 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-purple-400">说书人 V10.2</h1>
          <p className="text-xs text-gray-500 mt-1">{gamePhase === "setup" ? "准备阶段" : `第 ${nightCount} 夜 / ${gamePhase === 'day' ? '白天' : '夜晚'}`}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {Object.entries(groupedRoles).map(([type, typeRoles]) => (
            <div key={type} className="mb-6">
              <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">{typeLabels[type]}</h3>
              <div className="space-y-2">
                {typeRoles.map(role => {
                    const isTaken = seats.some(s => s.role?.id === role.id);
                    return (
                      <div key={role.id} onClick={(e) => { e.stopPropagation(); if (gamePhase==="setup" && !isTaken) setSelectedRole(role); }}
                        className={`p-2 rounded cursor-pointer border flex justify-between ${isTaken ? 'opacity-30 cursor-not-allowed border-gray-700' : ''} ${typeColors[role.type]} ${selectedRole?.id === role.id ? 'ring-2 ring-white scale-105' : 'opacity-70'}`}>
                        <div className="font-medium">{role.name}</div>
                      </div>
                    )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 主区域 */}
      <div className="flex-1 relative flex items-center justify-center bg-gray-900">
        <div className="relative w-[60vh] h-[60vh]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-50 pointer-events-auto">
             {gamePhase === "day" && (
                <>
                  <div className="text-4xl mb-4">🌞</div>
                  <div className="text-xl font-bold text-yellow-100 mb-4">第 {nightCount} 天</div>
                  <button onClick={() => startNight(false)} className="px-6 py-2 bg-indigo-600 rounded-full hover:bg-indigo-500 shadow-lg cursor-pointer">进入下一夜</button>
                </>
             )}
             {gamePhase === "setup" && (
               <button onClick={handlePreStartNight} className="px-6 py-3 bg-indigo-600 rounded-full hover:bg-indigo-500 shadow-lg font-bold text-lg cursor-pointer">开始首夜</button>
             )}
          </div>

          {seats.map((seat, index) => {
            const pos = getSeatPosition(index, 15);
            return (
              <div key={seat.id} onClick={(e) => { e.stopPropagation(); }} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, seatId: seat.id }); }}
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
                className={`absolute w-14 h-14 rounded-full flex items-center justify-center text-xs text-center p-1 cursor-pointer transition-all border-2 z-30
                  ${seat.isDead ? 'grayscale bg-gray-700 border-gray-600' : (seat.role ? typeColors[seat.role.type] : 'bg-gray-800')}
                  ${seat.isSentenced ? 'ring-4 ring-red-600 animate-pulse' : ''}
                `}
              >
                <div className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-gray-700 border border-gray-500 flex items-center justify-center font-bold text-white z-50 shadow-md">{seat.id + 1}</div>
                {seat.role?.id === 'drunk' ? seat.charadeRole?.name : (seat.role?.name || "空")}
                {seat.role?.id === 'drunk' && <span className="absolute bottom-1 text-[8px] text-yellow-300">酒鬼</span>}
                {seat.isSentenced && <div className="absolute -bottom-6 bg-red-600 text-[10px] px-1 rounded">⚖️待处决</div>}
                
                <div className="absolute -top-4 -right-4 flex flex-col gap-0.5 w-8 items-end pointer-events-auto z-50">
                    {seat.isPoisoned && <button className="bg-green-900 rounded-full w-5 h-5 flex items-center justify-center text-[12px]">🧪</button>}
                    {(seat.isDrunk || seat.role?.id === "drunk") && <button className="bg-yellow-900 rounded-full w-5 h-5 flex items-center justify-center text-[12px]">🍺</button>}
                    {seat.isProtected && <button className="bg-blue-900 rounded-full w-5 h-5 flex items-center justify-center text-[12px]">🛡️</button>}
                    {seat.isRedHerring && <button className="bg-red-900 rounded-full w-5 h-5 flex items-center justify-center text-[12px]">😈</button>}
                    {seat.masterId !== null && <button className="bg-purple-600 rounded w-auto px-1 h-5 flex items-center justify-center text-[10px]">🔗{seat.masterId + 1}</button>}
                    {seat.isDead && <span className="text-lg drop-shadow-md">💀</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 弹窗区 */}
      {showDrunkModal !== null && (
        <div className="absolute inset-0 z-[150] bg-black/95 flex items-center justify-center p-4">
            <div className="bg-gray-800 border-2 border-yellow-500 p-6 rounded-2xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-4 text-center text-yellow-400">🍺 设置酒鬼伪装身份</h2>
                <div className="grid grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto">
                    {groupedRoles['townsfolk']?.map(role => {
                        const isTaken = seats.some(s => s.role?.id === role.id);
                        return (
                            <button key={role.id} onClick={() => confirmDrunkCharade(role)} disabled={isTaken} className={`p-2 border rounded ${isTaken ? 'bg-gray-700 cursor-not-allowed' : 'bg-blue-900/50 border-blue-600'}`}>{role.name}</button>
                        )
                    })}
                </div>
            </div>
        </div>
      )}

      {showDayActionModal !== null && (
        <div className="absolute inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowShootModal(null)}>
            <div className="bg-gray-800 border border-red-500 p-6 rounded-2xl max-w-md w-full text-center" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-4 text-red-400">{showDayActionModal.type === 'slayer' ? '💥 选择开枪目标' : '🗣️ 选择提名目标'}</h2>
                <div className="flex flex-wrap justify-center gap-3">
                    {seats.filter(s => s.id !== showDayActionModal.sourceId && !s.isDead).map(s => (
                        <button key={s.id} onClick={() => {
                            handleDayAction(s.id);
                            setShowShootModal(null);
                            setShowNominateModal(null);
                        }} className="p-3 bg-gray-700 rounded-xl hover:bg-gray-600">{s.id + 1}号 {s.role?.name}</button>
                    ))}
                </div>
                <button onClick={() => { setShowShootModal(null); setShowNominateModal(null); }} className="mt-6 w-full py-2 bg-gray-600 rounded">取消</button>
            </div>
        </div>
      )}

      {showVirginTriggerModal && (
          <div className="absolute inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
              <div className="bg-indigo-900 border-2 border-white p-8 rounded-2xl max-w-md text-center">
                  <h2 className="text-3xl font-bold mb-4 text-yellow-300">✨ 圣女技能触发！</h2>
                  <p className="mb-6 text-lg">{showVirginTriggerModal.source.id + 1}号(提名者) 将被立即处决。</p>
                  <div className="flex gap-4 justify-center">
                      <button onClick={() => setShowVirginTriggerModal(null)} className="px-6 py-3 bg-gray-600 rounded-xl">取消</button>
                      <button onClick={confirmVirginTrigger} className="px-6 py-3 bg-red-600 font-bold rounded-xl">执行处决</button>
                  </div>
              </div>
          </div>
      )}

      {showRavenkeeperFakeModal !== null && (
          <div className="absolute inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
              <div className="bg-gray-800 border-2 border-purple-500 p-6 rounded-2xl w-full max-w-lg">
                  <h2 className="text-xl font-bold mb-4 text-center">🧛 (中毒) 编造查验结果</h2>
                  <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto">
                      {roles.map(role => (
                          <button key={role.id} onClick={() => confirmRavenkeeperFake(role)} className="p-2 text-xs border rounded bg-gray-700 hover:bg-gray-600">{role.name}</button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {contextMenu && (
        <div className="absolute bg-gray-800 border border-gray-600 rounded shadow-xl z-50 overflow-hidden min-w-[160px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {gamePhase === 'day' && !seats[contextMenu.seatId].isDead && (
              <>
                <button onClick={() => { setShowShootModal(contextMenu.seatId); setShowDayActionModal({type: 'slayer', sourceId: contextMenu.seatId}); setContextMenu(null); }} className="block w-full text-left px-4 py-3 hover:bg-red-900/50 text-red-300 font-bold border-b border-gray-700">🔫 开枪</button>
                <button onClick={() => { setShowNominateModal(contextMenu.seatId); setShowDayActionModal({type: 'nominate', sourceId: contextMenu.seatId}); setContextMenu(null); }} className="block w-full text-left px-4 py-3 hover:bg-purple-900/50 text-purple-300 font-bold border-b border-gray-700">🗣️ 提名</button>
              </>
          )}
          {seats[contextMenu.seatId].isSentenced && (
              <button onClick={() => { executePlayer(contextMenu.seatId); setContextMenu(null); }} className="block w-full text-left px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-bold border-b border-gray-700">🪓 执行处决</button>
          )}
          <button onClick={() => toggleStatus('dead')} className="block w-full text-left px-4 py-2 hover:bg-gray-700">💀 切换 死亡</button>
          <button onClick={() => toggleStatus('drunk')} className="block w-full text-left px-4 py-2 hover:bg-gray-700">🍺 切换 酒鬼</button>
          <button onClick={() => toggleStatus('poison')} className="block w-full text-left px-4 py-2 hover:bg-gray-700">🧪 切换 中毒</button>
          <button onClick={() => toggleStatus('redherring')} className="block w-full text-left px-4 py-2 hover:bg-gray-700 text-red-400">😈 切换 红罗刹</button>
        </div>
      )}

      {(gamePhase === "firstNight" || gamePhase === "night") && currentWakeSeat && currentWakeSeat.role && (
        <div className="absolute inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-600 p-6 rounded-2xl max-w-lg w-full text-center">
            <h2 className={`text-3xl font-bold mb-4 ${typeColors[currentWakeSeat.role.type].replace('bg-', 'text-')}`}>
              {currentWakeSeat.role.id === "drunk" ? currentWakeSeat.charadeRole?.name : currentWakeSeat.role.name} 
              <span className="text-sm text-gray-400 ml-2">({currentWakeSeat.id + 1}号)</span>
            </h2>
            <div className={`p-4 rounded-xl border mb-6 text-left ${currentHint.isPoisoned ? "bg-red-900/30 border-red-500" : "bg-gray-900 border-gray-700"}`}>
              <p className={`text-lg leading-relaxed whitespace-pre-wrap ${currentHint.isPoisoned ? "text-green-300 font-bold" : "text-yellow-100"}`}>
                  {currentHint.isPoisoned ? `💡 ${currentHint.fakeHint}` : currentHint.realHint}
              </p>
            </div>
            <div className="mb-6">
                <p className="text-sm text-gray-400 mb-2">选择目标：</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {seats.filter(s => s.role && !s.isDead).map(s => {
                      const isDrunkTarget = s.role?.id === "drunk";
                      const targetName = isDrunkTarget ? `${s.charadeRole?.name}(酒鬼)` : s.role?.name;
                      return (
                        <button key={s.id} onClick={() => toggleTarget(s.id)} disabled={isTargetDisabled(s)} className={`p-2 rounded border text-xs ${selectedActionTargets.includes(s.id) ? 'bg-indigo-600 border-white' : 'bg-gray-700 border-gray-600'} ${isTargetDisabled(s) ? 'opacity-20 cursor-not-allowed' : ''}`}>
                          {s.id + 1}号 {targetName}
                        </button>
                      )
                  })}
                </div>
            </div>
            {inspectionResult && <div className="mb-4 p-2 bg-blue-900/50 rounded text-xl font-bold">{inspectionResult}</div>}
            <div className="flex gap-4">
              <button onClick={() => setCurrentWakeIndex(prev => Math.max(0, prev - 1))} className="flex-1 py-3 bg-gray-600 rounded-xl">上一步</button>
              <button onClick={() => {
                  if (currentWakeIndex < wakeQueue.length - 1) setCurrentWakeIndex(prev => prev + 1);
                  else setGamePhase("dawnReport");
              }} className="flex-1 py-3 bg-white text-black font-bold rounded-xl">跳过/下一步</button>
              {canUseSkill() && (
                  <button onClick={handleConfirmAction} className="flex-1 py-3 bg-red-600 font-bold rounded-xl">确认行动</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 结算页面 */}
      {gamePhase === "gameOver" && (
        <div className="absolute inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 overflow-auto">
            <div className="bg-gray-900 border-2 border-white p-6 rounded-2xl w-full max-w-4xl flex flex-col max-h-[90vh]" ref={reportRef} style={{ backgroundColor: '#111827', color: 'white' }}>
                <div className="text-center mb-6 flex-shrink-0">
                    <h1 style={{ fontSize: '3rem', fontWeight: 'bold', color: winResult === "good" ? '#60a5fa' : '#f87171' }}>
                        {winResult === "good" ? "🏆 好人阵营胜利！" : "👿 邪恶阵营胜利！"}
                    </h1>
                </div>
                {/* 可视化圆桌 */}
                <div className="flex-1 relative min-h-[40vh] rounded-xl" style={{ backgroundColor: '#1f2937', marginBottom: '20px' }}>
                      {initialSeats.map((seat, index) => {
                        const pos = getSeatPosition(index, 15);
                        const finalState = seats.find(s => s.id === seat.id);
                        const roleName = seat.role?.id === "drunk" ? `${seat.charadeRole?.name}(酒)` : seat.role?.name;
                        const roleColor = seat.role?.type==='townsfolk'?'#60a5fa':seat.role?.type==='outsider'?'#c084fc':seat.role?.type==='minion'?'#ef4444':'#dc2626';
                        return (
                          <div key={seat.id} style={{ 
                                position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)',
                                width: '3.5rem', height: '3.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid white', borderRadius: '9999px',
                                backgroundColor: finalState?.isDead ? '#374151' : '#1f2937', filter: finalState?.isDead ? 'grayscale(100%)' : 'none', zIndex: 30
                            }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: roleColor }}>{roleName || "空"}</span>
                          </div>
                        );
                      })}
                </div>
                <div className="text-center" data-html2canvas-ignore>
                    <button onClick={exportImage} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-full">📸 保存图片</button>
                    <button onClick={() => window.location.reload()} className="px-6 py-3 bg-white text-black font-bold rounded-full ml-4">🔄 再来一局</button>
                </div>
            </div>
        </div>
      )}
      
      {/* 历史记录弹窗 */}
      {showHistory && (
          <div className="absolute inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowHistory(false)}>
              <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-2xl h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
                  <h2 className="text-2xl font-bold mb-4 text-center">📜 游戏记录</h2>
                  <ul className="space-y-2 text-sm text-gray-300">
                      {gameLogs.map((log, i) => (
                          <li key={i} className="border-b border-gray-700 pb-2">
                              <span className={`font-mono mr-2 font-bold ${log.phase === 'day' ? 'text-yellow-500' : 'text-purple-400'}`}>[{log.phase === 'day' ? `第${log.day}天` : `第${log.day}夜`}]</span>
                              {log.message}
                          </li>
                      ))}
                  </ul>
                  <button onClick={() => setShowHistory(false)} className="mt-4 w-full py-2 bg-gray-600 rounded">关闭</button>
              </div>
          </div>
      )}

      {/* 角色图鉴弹窗 */}
      {showRoleCard && (
        <div className="absolute inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowRoleCard(false)}>
            <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-5xl h-[85vh] overflow-y-auto relative pretty-scrollbar" onClick={e => e.stopPropagation()}>
                <h2 className="text-3xl font-bold mb-8 text-center text-purple-300">🃏 角色图鉴 (灾祸滋生)</h2>
                <button onClick={() => setShowRoleCard(false)} className="absolute top-6 right-6 text-gray-400 hover:text-white text-2xl">✕</button>
                <div className="space-y-10">
                    {Object.entries(groupedRoles).map(([type, typeRoles]) => (
                        <div key={type}>
                           <h3 className={`text-xl font-bold mb-4 border-b border-gray-700 pb-2 ${textColors[type]}`}>{typeLabels[type]}</h3>
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                               {typeRoles.map(role => (
                                   <div key={role.id} className={`relative overflow-hidden rounded-xl border-2 ${typeColors[role.type].replace('bg-', 'border-')} bg-gray-900/80 p-5 flex flex-col items-center text-center`}>
                                       <h4 className={`text-2xl font-extrabold mb-3 mt-2 ${textColors[role.type]}`}>{role.name}</h4>
                                       <p className="text-gray-300 text-sm leading-relaxed font-medium">{role.ability}</p>
                                   </div>
                               ))}
                           </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}