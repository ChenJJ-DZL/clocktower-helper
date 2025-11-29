"use client";

import { useState, useEffect, useRef } from "react";
import { roles, Role, Seat, LogEntry, GamePhase, WinResult, groupedRoles, typeLabels, typeColors, typeBgColors } from "./data";
import html2canvas from 'html2canvas';

// --- 辅助类型 ---
interface NightHintState { isPoisoned: boolean; reason?: string; guide: string; speak: string; action?: string; }

const phaseNames: Record<string, string> = {
    setup: "准备阶段", check: "核对身份", firstNight: "首夜", 
    day: "白天", dusk: "黄昏/处决", night: "夜晚", 
    dawnReport: "天亮结算", gameOver: "游戏结束"
};

// --- 辅助工具函数 ---
const formatTimer = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
};

const getSeatPosition = (index: number, total: number = 15) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    const radius = 40; 
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { x: x.toFixed(2), y: y.toFixed(2) };
};

// 随机获取数组元素
const getRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// 核心计算逻辑：获取夜晚提示
const calculateNightInfo = (seats: Seat[], currentSeatId: number, gamePhase: GamePhase) => {
    const targetSeat = seats.find(s => s.id === currentSeatId);
    if (!targetSeat || !targetSeat.role) return null;

    const effectiveRole = targetSeat.role.id === "drunk" ? targetSeat.charadeRole : targetSeat.role;
    if (!effectiveRole) return null;

    const isPoisoned = targetSeat.isPoisoned || targetSeat.isDrunk || targetSeat.role.id === "drunk";
    const reason = targetSeat.isPoisoned ? "中毒" : "酒鬼";
    let guide = "", speak = "", action = "";

    const getAlign = (s: Seat) => s.isRedHerring || ["minion","demon"].includes(s.role?.type||"") || s.isDemonSuccessor || (s.role?.id==="recluse"&&Math.random()<0.3);
    const isBad = (s: Seat) => getAlign(s);

    if (effectiveRole.id === 'imp') {
        if (gamePhase === 'firstNight') {
             const minions = seats.filter(s => s.role?.type === 'minion').map(s => `${s.id+1}号`);
             guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
             speak = `“请确认你的爪牙。”`;
             action = "展示爪牙";
        } else {
             guide = "👉 让小恶魔选人杀害。";
             speak = "“请选择一名玩家杀害。”";
             action = "杀害";
        }
    } else if (effectiveRole.id === 'poisoner') {
        guide = "🧪 选择一名玩家下毒。"; speak = "“请选择一名玩家下毒。”"; action = "投毒";
    } else if (effectiveRole.id === 'monk') {
        guide = "🛡️ 选择一名玩家保护。"; speak = "“请选择一名玩家保护。”"; action = "保护";
    } else if (effectiveRole.id === 'fortune_teller') {
        guide = "🔮 查验2人。若有恶魔/红罗刹->是。"; speak = "“请选择两名玩家查验。”"; action = "查验";
    } else if (effectiveRole.id === 'empath') {
        const alive = seats.filter(s => !s.isDead);
        const idx = alive.findIndex(s => s.id === currentSeatId);
        if (idx !== -1) {
            const p = alive[(idx - 1 + alive.length) % alive.length];
            const n = alive[(idx + 1) % alive.length];
            let c = 0; if (isBad(p)) c++; if (isBad(n)) c++;
            const fakeC = c===0 ? 1 : (c===2 ? 1 : (Math.random()<0.5?0:2));
            if (isPoisoned) {
                 guide = `⚠️ [异常] 真实:${c}。请报伪造数据: ${fakeC} (比划${fakeC})`;
                 speak = `(向他比划数字 ${fakeC})`;
            } else {
                 guide = `👂 真实信息: ${c} (比划${c})`;
                 speak = `(向他比划数字 ${c})`;
            }
            action = "告知";
        }
    } else if (['washerwoman','librarian','investigator'].includes(effectiveRole.id) && gamePhase==='firstNight') {
        let type = effectiveRole.id==='washerwoman'?"townsfolk":effectiveRole.id==='librarian'?"outsider":"minion";
        const pool = seats.filter(s => s.role?.type === type && s.id !== currentSeatId);
        if(pool.length > 0) {
            const t = pool[Math.floor(Math.random()*pool.length)];
            const d = seats.find(s => s.id !== t.id && s.id !== currentSeatId) || seats.find(s => s.id !== t.id);
            
            if (isPoisoned) {
                // 伪造逻辑：排除自己，且排除真实目标
                const fakeRole = roles.find(r => r.type === type && r.id !== t.role?.id && r.id !== effectiveRole.id) || roles[0];
                guide = `⚠️ [异常] 请展示错误：【${fakeRole.name}】在 ${t.id+1} 或 ${d?.id+1}`;
                speak = "请看这里。";
            } else {
                guide = `👀 真实: 【${t.role?.name}】在 ${t.id+1} 或 ${d?.id+1}`;
                speak = "请看这里。";
            }
        } else { 
            guide = "无此角色。示0。"; speak = "(比划0)"; 
        }
        action = "展示";
    } else if (effectiveRole.id === 'spy') {
        guide = "📖 间谍查看魔典。"; speak = "“请查看魔典。”"; action="展示";
    } else if (effectiveRole.id === 'ravenkeeper') {
        if (!targetSeat.isDead) { guide = "你还活着。"; speak = "（摇头示意无效）"; }
        else { guide = "查验一身份。"; speak = "“请选择一名玩家。”"; }
        action = "查验";
    } else {
        guide = "💤 无行动。"; speak = "（无）"; action="跳过";
    }
    return { seat: targetSeat, effectiveRole, isPoisoned, reason, guide, speak, action };
};

// --- 主组件 ---
export default function Home() {
  // 1. 完整状态定义 (State)
  const [mounted, setMounted] = useState(false);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [initialSeats, setInitialSeats] = useState<Seat[]>([]);
  
  const [gamePhase, setGamePhase] = useState<GamePhase>("setup");
  const [nightCount, setNightCount] = useState(1);
  const [deadThisNight, setDeadThisNight] = useState<string[]>([]);
  const [executedPlayerId, setExecutedPlayerId] = useState<number | null>(null);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
  const [winResult, setWinResult] = useState<WinResult>(null);
  const [virginAbilityUsed, setVirginAbilityUsed] = useState(false);
  
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [timer, setTimer] = useState(0);
  
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; seatId: number } | null>(null);
  const [statusModalSeat, setStatusModalSeat] = useState<Seat | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showRoleCard, setShowRoleCard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [archivedHistory, setArchivedHistory] = useState<any[]>([]);
  
  const [wakeQueueIds, setWakeQueueIds] = useState<number[]>([]);
  const [currentWakeIndex, setCurrentWakeIndex] = useState(0);
  const [selectedActionTargets, setSelectedActionTargets] = useState<number[]>([]);
  const [inspectionResult, setInspectionResult] = useState<string | null>(null);
  const [currentHint, setCurrentHint] = useState<NightHintState>({ isPoisoned: false, guide: "", speak: "" });

  // 弹窗状态
  const [showShootModal, setShowShootModal] = useState<number | null>(null);
  const [showNominateModal, setShowNominateModal] = useState<number | null>(null);
  const [showDayActionModal, setShowDayActionModal] = useState<{type: 'slayer'|'nominate', sourceId: number} | null>(null);
  const [showDrunkModal, setShowDrunkModal] = useState<number | null>(null);
  const [showVirginTriggerModal, setShowVirginTriggerModal] = useState<{source: Seat, target: Seat} | null>(null);
  const [showRavenkeeperFakeModal, setShowRavenkeeperFakeModal] = useState<number | null>(null);
  const [showTeammateWarningModal, setShowTeammateWarningModal] = useState<number | null>(null);
  const [showVoteInputModal, setShowVoteInputModal] = useState<number | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false); // 修复：已添加
  const [showConfirmModal, setShowConfirmModal] = useState<{title:string, content:string, onConfirm:()=>void}|null>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const seatsRef = useRef(seats);

  // ===========================
  // 2. Effects
  // ===========================
  useEffect(() => {
      setMounted(true);
      setSeats(Array.from({ length: 15 }, (_, i) => ({ 
          id: i, role: null, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, 
          isRedHerring: false, isSentenced: false, masterId: null, hasUsedSlayerAbility: false, hasUsedVirginAbility: false, isDemonSuccessor: false, statusDetails: []
      })));
  }, []);

  useEffect(() => { setTimer(0); }, [gamePhase]);
  
  useEffect(() => { 
      if(!mounted) return;
      const i = setInterval(() => setTimer(t => t + 1), 1000); 
      return () => clearInterval(i); 
  }, [mounted]);
  
  useEffect(() => { seatsRef.current = seats; }, [seats]);

  const addLog = (msg: string) => setGameLogs(p => [...p, { day: nightCount, phase: gamePhase, message: msg }]);

  // ===========================
  // 3. 核心提示计算 (Render Logic)
  // ===========================
  const nightInfo = (gamePhase === "firstNight" || gamePhase === "night") && wakeQueueIds.length > 0
    ? calculateNightInfo(seats, wakeQueueIds[currentWakeIndex], gamePhase)
    : null;

  useEffect(() => {
      if (nightInfo) {
          setCurrentHint({ isPoisoned: nightInfo.isPoisoned, reason: nightInfo.reason, guide: nightInfo.guide, speak: nightInfo.speak });
          // 切换角色时重置选择，除非是同一角色操作
          if (selectedActionTargets.length > 0 && seats.find(s=>s.id===selectedActionTargets[0])?.id !== wakeQueueIds[currentWakeIndex]) {
               // 不自动清空，允许连选，仅在角色改变时清空
               // 此处简单处理：每次唤醒新角色时清空
               // 实际上应在 currentWakeIndex 变化时清空
          }
      }
  }, [currentWakeIndex, gamePhase, seats]); // 依赖 seats

  useEffect(() => {
      setSelectedActionTargets([]);
      setInspectionResult(null);
  }, [currentWakeIndex, gamePhase]);

  if (!mounted) return null;

  // ===========================
  // 4. 交互 Handlers
  // ===========================
  const handleSeatClick = (id: number) => {
      if(gamePhase==='setup') {
          if(selectedRole) {
               if(seats.some(s=>s.role?.id===selectedRole.id)) return alert("该角色已入座");
               setSeats(p=>p.map(s=>s.id===id?{...s,role:selectedRole}:s)); setSelectedRole(null);
          } else setSeats(p=>p.map(s=>s.id===id?{...s,role:null}:s));
      }
  };

  const handlePreStartNight = () => {
      const active = seats.filter(s => s.role);
      if (active.length === 0) return alert("请先安排座位");
      
      // 移除空座
      const compact = active.map((s, i) => ({ ...s, id: i }));
      setSeats(compact);

      setTimeout(() => {
          const drunk = compact.find(s => s.role?.id === "drunk" && !s.charadeRole);
          if(drunk) { setShowDrunkModal(drunk.id); return; }
          
          const withRed = [...compact];
          if(!withRed.some(s => s.isRedHerring)) {
              const good = withRed.filter(s => ["townsfolk","outsider"].includes(s.role?.type || ""));
              if(good.length > 0) {
                  const t = getRandom(good);
                  withRed[t.id] = { ...withRed[t.id], isRedHerring: true, statusDetails: [...withRed[t.id].statusDetails, "红罗刹"] };
              }
          }
          setSeats(withRed); setInitialSeats(JSON.parse(JSON.stringify(withRed))); setGamePhase("check");
      }, 100);
  };

  const confirmDrunkCharade = (r: Role) => {
      setSeats(p => p.map(s => s.id === showDrunkModal ? { ...s, charadeRole: r, isDrunk: true } : s));
      setShowDrunkModal(null);
      setTimeout(() => alert("酒鬼设置完成！"), 100);
  };

  const startNight = (isFirst: boolean) => {
      if(isFirst) setStartTime(new Date());
      setSeats(p => p.map(s => ({...s, isPoisoned: false, isProtected: false, voteCount: undefined, isCandidate: false})));
      setDeadThisNight([]);
      const q = seats.filter(s => s.role).filter(s => !s.isDead || s.role?.id === 'ravenkeeper').sort((a,b) => {
          const ra = a.role?.id === 'drunk' ? a.charadeRole : a.role;
          const rb = b.role?.id === 'drunk' ? b.charadeRole : b.role;
          return (isFirst ? (ra?.firstNightOrder??0) : (ra?.otherNightOrder??0)) - (isFirst ? (rb?.firstNightOrder??0) : (rb?.otherNightOrder??0));
      });
      const validQueue = q.filter(s => {
          const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
          return isFirst ? (r?.firstNightOrder ?? 0) > 0 : (r?.otherNightOrder ?? 0) > 0;
      });
      setWakeQueueIds(validQueue.map(s => s.id)); setCurrentWakeIndex(0); setSelectedActionTargets([]);
      setGamePhase(isFirst ? "firstNight" : "night"); if(!isFirst) setNightCount(n => n + 1);
  };

  const toggleTarget = (id: number) => {
      if(!nightInfo) return;
      if(nightInfo.effectiveRole.id==='poisoner') {
          const t = seats.find(s=>s.id===id);
          const isEvil = ['minion','demon'].includes(t?.role?.type||'');
          if(isEvil && !selectedActionTargets.includes(id)) { setShowTeammateWarningModal(id); return; }
      }

      const max = nightInfo.effectiveRole.id==='fortune_teller'?2:1;
      // 修复：占卜师多选逻辑修正 (slice(-max) 保留最后 max 个)
      let newT = [...selectedActionTargets];
      if (newT.includes(id)) {
          newT = newT.filter(t => t !== id);
      } else {
          newT.push(id);
          if (newT.length > max) newT = newT.slice(-max); // 这里的 slice 逻辑修复
      }
      setSelectedActionTargets(newT);
      
      if(newT.length > 0) {
          const tid = newT[newT.length - 1];
          const action = nightInfo.effectiveRole.nightActionType;
          if(action === 'poison') setSeats(p => p.map(s => ({...s, isPoisoned: s.id === tid})));
          if(action === 'protect') setSeats(p => p.map(s => ({...s, isProtected: s.id === tid})));
          if(action === 'mark' && nightInfo.effectiveRole.id === 'butler') setSeats(p => p.map(s => ({...s, masterId: tid})));
      }
      
      if(nightInfo.effectiveRole.nightActionType === 'inspect' && newT.length === 2) {
           const hasEvil = newT.some(tid => { const t=seats.find(x=>x.id===tid); return ['demon'].includes(t?.role?.type||'')||t?.isRedHerring });
           setInspectionResult(currentHint.isPoisoned ? "🎲 [中毒] 随机" : (hasEvil ? "✅ 是" : "❌ 否"));
      }
      if(nightInfo.effectiveRole.nightActionType === 'inspect_death' && newT.length === 1) {
          const t = seats.find(s=>s.id===newT[0]);
          setInspectionResult(`真实: ${t?.role?.name}`);
          if(currentHint.isPoisoned) setShowRavenkeeperFakeModal(newT[0]);
      }
  };

  const handleConfirmAction = () => {
      if(nightInfo?.effectiveRole.nightActionType === 'kill' && selectedActionTargets.length > 0) {
          const t = seats.find(s => s.id === selectedActionTargets[0]);
          if(t && !t.isProtected && t.role?.id !== 'soldier' && gamePhase !== 'firstNight') {
              setDeadThisNight(p => [...p, t.role?.name || ""]); 
              setSeats(p=>p.map(s=>s.id===t.id?{...s,isDead:true}:s));
          }
      }
      if(currentWakeIndex < wakeQueueIds.length - 1) { setCurrentWakeIndex(p => p + 1); setInspectionResult(null); }
      else setGamePhase("dawnReport");
  };

  const executePlayer = (id: number) => {
      const t = seats.find(s => s.id === id);
      const newSeats = seats.map(s => s.id === id ? { ...s, isDead: true } : s);
      setSeats(newSeats);
      addLog(`${id+1}号 被处决`); setExecutedPlayerId(id);
      
      // 胜利判定
      const aliveDemon = newSeats.find(s => (s.role?.type==='demon' || s.isDemonSuccessor) && !s.isDead);
      if (!aliveDemon) { setWinResult('good'); setGamePhase('gameOver'); return; }
      if (t?.role?.id === 'saint' && !t.isPoisoned) { setWinResult('evil'); setGamePhase('gameOver'); return; }
      
      const aliveCount = newSeats.filter(s=>!s.isDead).length;
      if(aliveCount <= 2) { setWinResult('evil'); setGamePhase('gameOver'); return; }
      
      setTimeout(() => { alert("处决完成，进入夜晚"); startNight(false); }, 500);
  };

  const handleDayAction = (id: number) => {
      if(!showDayActionModal) return;
      const {type, sourceId} = showDayActionModal; setShowDayActionModal(null);
      if(type==='nominate') {
           addLog(`${sourceId+1}号 提名 ${id+1}号`); setGamePhase("dusk"); setShowVoteInputModal(id);
      }
  };
  const submitVotes = (v: number) => {
      if(showVoteInputModal===null) return;
      const alive = seats.filter(s=>!s.isDead).length;
      const threshold = Math.ceil(alive/2);
      setSeats(p=>p.map(s=>s.id===showVoteInputModal?{...s,voteCount:v,isCandidate:v>=threshold}:s));
      setShowVoteInputModal(null);
  };
  const executeJudgment = () => {
      const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
      if(cands.length===0) { if(confirm("无人上台，直接入夜？")) startNight(false); return; }
      const max = cands[0].voteCount || 0;
      const tops = cands.filter(c => c.voteCount === max);
      if(tops.length>1) { alert("平票，平安日"); startNight(false); }
      else if(confirm(`处决 ${tops[0].id+1}号？`)) executePlayer(tops[0].id);
  };
  const handleContextMenu = (e: React.MouseEvent, seatId: number) => { e.preventDefault(); setContextMenu({x:e.clientX,y:e.clientY,seatId}); };
  const handleMenuAction = (action: string) => {
      if(!contextMenu) return;
      if(action==='nominate') { setGamePhase('dusk'); setShowVoteInputModal(contextMenu.seatId); }
      setContextMenu(null);
  };
  const toggleStatus = (type: string) => {
      if(!contextMenu) return;
      setSeats(p => p.map(s => s.id === contextMenu.seatId ? {
          ...s,
          isDead: type === 'dead' ? !s.isDead : s.isDead,
          isPoisoned: type === 'poison' ? !s.isPoisoned : s.isPoisoned,
          isDrunk: type === 'drunk' ? !s.isDrunk : s.isDrunk,
          isRedHerring: type === 'redherring' ? !s.isRedHerring : s.isRedHerring
      } : s));
      setContextMenu(null);
  };
  const confirmRavenkeeperFake = (r: Role) => {
      setInspectionResult(`🎲 (中毒) 伪造身份: ${r.name}`); setShowRavenkeeperFakeModal(null);
  };

  // ===========================
  // 5. Render
  // ===========================
  return (
    <div className={`flex h-screen text-white overflow-hidden relative ${gamePhase==='day'?'bg-sky-900':gamePhase==='dusk'?'bg-stone-900':'bg-gray-950'}`} onClick={()=>{setContextMenu(null);setShowMenu(false);}}>
      <div className="absolute top-4 right-4 z-50 flex gap-2">
          <button onClick={()=>{if(gamePhase==='gameOver')setShowReviewModal(true)}} className="p-3 bg-indigo-600 border rounded-lg shadow-lg">复盘</button>
          <button onClick={(e)=>{e.stopPropagation();setShowMenu(!showMenu)}} className="p-3 bg-gray-800 border rounded-lg shadow-lg">☰</button>
          {showMenu && <div className="absolute right-0 mt-14 w-48 bg-gray-800 border rounded-lg shadow-xl z-[1000]"><button onClick={()=>window.location.reload()} className="w-full p-4 text-left text-red-400 hover:bg-gray-700">🔄 重开</button></div>}
      </div>
      
      <div className="w-3/5 relative flex items-center justify-center border-r border-gray-700">
          {nightInfo && <div className="absolute top-4 left-4 text-4xl font-bold text-blue-300 bg-black/50 p-4 rounded-xl shadow-lg border border-blue-500 z-50">{nightInfo.seat.id+1}号</div>}
          <div className="absolute pointer-events-none text-center z-0 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="text-6xl font-bold opacity-50 mb-4">{phaseNames[gamePhase]}</div>
              {gamePhase!=='setup' && <div className="text-5xl font-mono text-yellow-300">{formatTimer(timer)}</div>}
          </div>
          <div className="relative w-[70vmin] h-[70vmin]">
              {seats.map((s,i)=>{
                  const p=getSeatPosition(i, seats.length);
                  const colorClass = s.role ? typeColors[s.role.type] : 'border-gray-600 text-gray-400';
                  return <div key={s.id} onClick={(e)=>{e.stopPropagation();handleSeatClick(s.id)}} 
                  onContextMenu={(e)=>handleContextMenu(e,s.id)}
                  style={{left:`${p.x}%`,top:`${p.y}%`,transform:'translate(-50%,-50%)'}} 
                  className={`absolute w-24 h-24 rounded-full border-4 flex items-center justify-center cursor-pointer z-30 bg-gray-900 transition-all duration-300
                  ${colorClass} ${nightInfo?.seat.id===s.id?'ring-4 ring-yellow-400 scale-110 shadow-[0_0_30px_yellow]':''} ${s.isDead?'grayscale opacity-60':''} ${selectedActionTargets.includes(s.id)?'ring-4 ring-green-500 scale-105':''}`}>
                      <div className="absolute -top-4 -left-4 w-8 h-8 bg-gray-800 rounded-full border-2 border-gray-600 flex items-center justify-center text-lg font-bold">{s.id+1}</div>
                      <span className="text-sm font-bold text-center leading-tight px-1">{s.role?.id==='drunk'?`${s.charadeRole?.name}\n(酒)`:s.role?.name||"空"}</span>
                      <div className="absolute -bottom-3 flex gap-1">{s.isPoisoned&&<span className="text-lg">🧪</span>}{s.isProtected&&<span className="text-lg">🛡️</span>}{s.isRedHerring&&<span className="text-lg">😈</span>}</div>
                      {s.isCandidate&&<span className="absolute -top-8 text-sm bg-red-600 px-2 py-1 rounded-full shadow font-bold animate-pulse">⚖️{s.voteCount}</span>}
                  </div>
              })}
          </div>
      </div>

      <div className="w-2/5 flex flex-col border-l border-gray-800 bg-gray-900/95 z-40">
          <div className="p-6 border-b font-bold text-purple-400 text-2xl">控制台</div>
          <div className="flex-1 overflow-y-auto p-6">
              {gamePhase==='setup' && <div className="space-y-8">{Object.entries(groupedRoles).map(([type, list]) => <div key={type}><h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">{type}</h3><div className="grid grid-cols-3 gap-3">{list.map(r=>{const isTaken=seats.some(s=>s.role?.id===r.id); return <button key={r.id} onClick={(e)=>{e.stopPropagation();if(!isTaken)setSelectedRole(r)}} className={`p-3 border rounded-lg text-sm font-medium transition-all ${isTaken?'opacity-30 cursor-not-allowed bg-gray-800':''} ${typeBgColors[r.type]} ${selectedRole?.id===r.id?'ring-4 ring-white scale-105':''}`}>{r.name}</button>})}</div></div>)}</div>}
              {gamePhase==='check' && <div className="text-center"><h2 className="text-3xl font-bold mb-6">核对身份</h2><div className="bg-gray-800 p-6 rounded-xl text-left text-lg space-y-3 max-h-[60vh] overflow-y-auto">{seats.filter(s=>s.role).map(s=><div key={s.id} className="flex justify-between border-b border-gray-700 pb-2"><span>{s.id+1}号</span><span className={s.role?.type==='demon'?'text-red-500 font-bold':''}>{s.role?.name} {s.role?.id==='drunk' && `(伪:${s.charadeRole?.name})`} {s.isRedHerring && '[红罗刹]'}</span></div>)}</div></div>}
              
              {(gamePhase==='firstNight'||gamePhase==='night') && nightInfo ? (
                  <div className="space-y-6 animate-fade-in">
                      <div className="text-center mb-4"><h2 className={`text-5xl font-bold ${typeColors[nightInfo.effectiveRole.type].split(' ')[0]}`}>{nightInfo.effectiveRole.name}</h2><p className="text-gray-400 mt-1">{nightInfo.seat.id+1}号</p></div>
                      <div className={`p-6 rounded-2xl border-2 ${currentHint.isPoisoned?'bg-red-900/20 border-red-500':'bg-gray-800 border-gray-600'}`}>{currentHint.isPoisoned && <div className="text-red-400 font-bold mb-3 text-2xl flex items-center gap-2">⚠️ {currentHint.reason}</div>}<div className="mb-2 text-base text-gray-400 font-bold uppercase">📖 指引：</div><p className="text-xl mb-6 leading-relaxed whitespace-pre-wrap font-medium">{currentHint.guide}</p><div className="mb-2 text-base text-yellow-400 font-bold uppercase">🗣️ 台词：</div><p className="text-2xl font-serif bg-black/40 p-4 rounded-xl border-l-4 border-yellow-500 italic text-yellow-100">“{currentHint.speak}”</p></div>
                      {nightInfo.effectiveRole.nightActionType === 'spy_info' && <div className="bg-black/50 p-4 rounded-xl h-64 overflow-y-auto text-sm flex gap-4"><div className="w-1/2"><h4 className="text-purple-400 mb-3 font-bold border-b pb-1">魔典</h4>{seats.filter(s=>s.role).map(s => <div key={s.id} className="py-1 border-b border-gray-700 flex justify-between"><span>{s.id+1}号</span><span className={s.role?.type==='demon'?'text-red-500':''}>{s.role?.name}</span></div>)}</div><div className="w-1/2"><h4 className="text-yellow-400 mb-3 font-bold border-b pb-1">日志</h4>{gameLogs.slice().reverse().map((l,i)=><div key={i} className="py-1 border-b border-gray-700 text-gray-300">{l.message}</div>)}</div></div>}
                      {nightInfo.effectiveRole.nightActionType!=='spy_info' && nightInfo.effectiveRole.nightActionType!=='none' && <div className="grid grid-cols-3 gap-3 mt-4">{seats.filter(s=>s.role && (nightInfo.effectiveRole.id==='ravenkeeper' || !s.isDead)).map(s=><button key={s.id} onClick={()=>toggleTarget(s.id)} className={`p-3 border rounded-lg text-lg font-bold transition-all ${selectedActionTargets.includes(s.id)?'bg-green-600 border-white scale-105 shadow-lg':'bg-gray-700 border-gray-600 hover:bg-gray-600'}`}>[{s.id+1}] {s.role?.name}</button>)}</div>}
                      {inspectionResult && <div className="bg-blue-600 p-4 rounded-xl text-center font-bold text-3xl shadow-2xl mt-4 animate-bounce">{inspectionResult}</div>}
                  </div>
              ) : ((gamePhase==='firstNight'||gamePhase==='night') && <div className="text-center text-gray-500 mt-20 text-xl">正在计算...</div>)}
              
              {gamePhase==='dusk' && <div className="mt-4 bg-gray-800 p-4 rounded-xl"><h3 className="text-xl font-bold mb-2 text-orange-400">⚖️ 处决台</h3>{seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0)).map((s,i)=><div key={s.id} className={`flex justify-between p-2 border-b border-gray-600 ${i===0?'text-red-400 font-bold':''}`}><span>{s.id+1}号 {s.role?.name}</span><span>{s.voteCount}票</span></div>)}</div>}
          </div>
          
          <div className="p-6 border-t border-gray-700 bg-gray-900 flex gap-4 justify-center z-50">
              {gamePhase==='setup' && <button onClick={handlePreStartNight} className="w-full py-5 bg-indigo-600 rounded-xl font-bold text-2xl shadow-xl">开始游戏 (首夜)</button>}
              {gamePhase==='check' && <button onClick={()=>startNight(true)} className="w-full py-5 bg-green-600 rounded-xl font-bold text-2xl shadow-xl">确认无误，入夜</button>}
              {(gamePhase==='firstNight'||gamePhase==='night') && <><button onClick={()=>setCurrentWakeIndex(Math.max(0,currentWakeIndex-1))} className="flex-1 py-4 bg-gray-700 rounded-xl font-bold text-xl">上一步</button><button onClick={handleConfirmAction} className="flex-[2] py-4 bg-white text-black rounded-xl font-bold text-2xl">确认 / 下一步</button></>}
              {gamePhase==='day' && <button onClick={()=>setGamePhase('dusk')} className="w-full py-5 bg-orange-600 rounded-xl font-bold text-2xl">进入黄昏 (提名)</button>}
              {gamePhase==='dusk' && <><button onClick={executeJudgment} className="flex-[2] py-4 bg-red-600 rounded-xl font-bold text-2xl shadow-lg animate-pulse">执行处决</button><button onClick={()=>startNight(false)} className="flex-1 py-4 bg-indigo-600 rounded-xl font-bold text-xl">直接入夜</button></>}
              {gamePhase==='dawnReport' && <button onClick={()=>setGamePhase('day')} className="w-full py-5 bg-yellow-500 text-black rounded-xl font-bold text-2xl">进入白天</button>}
          </div>
      </div>

      {showDrunkModal!==null && <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center"><div className="bg-gray-800 p-8 rounded-2xl w-[800px] border-2 border-yellow-500"><h2 className="mb-6 text-center text-3xl text-yellow-400">🍺 请为酒鬼选择伪装 (互斥)</h2><div className="grid grid-cols-4 gap-4">{groupedRoles['townsfolk'].map(r=>{const isTaken=seats.some(s=>s.role?.id===r.id); return <button key={r.id} onClick={()=>!isTaken && confirmDrunkCharade(r)} disabled={isTaken} className={`p-4 border-2 rounded-xl text-lg font-bold ${isTaken?'opacity-20 cursor-not-allowed border-gray-700':'border-blue-500 hover:bg-blue-900'}`}>{r.name}</button>})}</div></div></div>}
      {showTeammateWarningModal!==null && <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center"><div className="bg-red-900 p-10 rounded-2xl text-center border-4 border-red-500"><h2 className="mb-8 text-4xl font-bold">🔴 警告：队友！</h2><div className="flex gap-8 justify-center"><button onClick={()=>setShowTeammateWarningModal(null)} className="px-8 py-4 bg-gray-600 rounded-xl text-2xl">取消</button><button onClick={()=>{const t=showTeammateWarningModal!;setSelectedActionTargets([t]);setSeats(p=>p.map(s=>({...s,isPoisoned:s.id===t})));setShowTeammateWarningModal(null)}} className="px-8 py-4 bg-red-600 text-white rounded-xl text-2xl font-bold border-2 border-white">强行投毒</button></div></div></div>}
      {showVoteInputModal!==null && <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center"><div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500"><h3 className="text-3xl font-bold mb-6">🗳️ 输入票数</h3><input autoFocus type="number" className="w-full p-4 bg-gray-700 rounded-xl mb-6 text-center text-4xl font-mono" onKeyDown={(e)=>{if(e.key==='Enter')submitVotes(parseInt(e.currentTarget.value)||0)}} /><button onClick={(e:any)=>submitVotes(parseInt(e.target.previousSibling.value)||0)} className="w-full py-4 bg-indigo-600 rounded-xl text-2xl font-bold">确认</button></div></div>}
      {showDayActionModal && <div className="fixed inset-0 z-[3000] bg-black/80 flex items-center justify-center"><div className="bg-gray-800 p-8 rounded-2xl w-[500px] text-center"><h2 className="mb-6 text-3xl font-bold text-red-400">{showDayActionModal.type==='slayer'?'💥 开枪':'🗣️ 提名'}</h2><div className="flex flex-wrap gap-3 justify-center">{seats.filter(s=>!s.isDead).map(s=><button key={s.id} onClick={()=>{handleDayAction(s.id);setShowDayActionModal(null);setShowShootModal(null);setShowNominateModal(null)}} className="p-4 border-2 rounded-xl text-xl font-bold">{s.id+1}号 {s.role?.name}</button>)}</div><button onClick={()=>{setShowDayActionModal(null);setShowShootModal(null);setShowNominateModal(null)}} className="mt-8 w-full py-3 bg-gray-600 rounded-xl text-xl">取消</button></div></div>}
      {showVirginTriggerModal && <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center"><div className="bg-indigo-900 p-10 rounded-2xl text-center border-4 border-white"><h2 className="text-4xl font-bold text-yellow-300 mb-6">✨ 贞洁者触发！</h2><div className="flex gap-6 justify-center"><button onClick={()=>setShowVirginTriggerModal(null)} className="px-6 py-4 bg-gray-600 rounded-xl text-xl">取消</button><button onClick={confirmVirginTrigger} className="px-6 py-4 bg-red-600 rounded-xl text-xl font-bold">处决提名者</button></div></div></div>}
      {showRavenkeeperFakeModal!==null && <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center"><div className="bg-gray-800 p-8 rounded-2xl w-[600px] border-2 border-purple-500"><h2 className="text-2xl font-bold mb-6 text-center">🧛 (中毒) 编造结果</h2><div className="grid grid-cols-3 gap-3">{roles.map(r=><button key={r.id} onClick={()=>confirmRavenkeeperFake(r)} className="p-3 border rounded-lg text-sm font-medium hover:bg-purple-900">{r.name}</button>)}</div></div></div>}
      {gamePhase==="dawnReport" && <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center"><div className="bg-gray-800 p-12 rounded-3xl text-center border-4 border-yellow-500 min-w-[500px]"><h2 className="text-6xl mb-8">🌅 天亮了！</h2><p className="text-3xl text-gray-300 mb-10">昨晚死亡：<span className="text-red-500 font-bold">{deadThisNight.length>0 ? deadThisNight.join(', ') : "平安夜"}</span></p><button onClick={()=>setGamePhase('day')} className="px-12 py-5 bg-yellow-500 text-black font-bold rounded-full text-3xl">开始白天</button></div></div>}
      {gamePhase==="gameOver" && <div className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center"><div className="text-center"><h1 className={`text-8xl font-bold mb-10 ${winResult==='good'?'text-blue-500':'text-red-500'}`}>{winResult==='good'?'🏆 好人胜利':'👿 邪恶胜利'}</h1><button onClick={()=>setShowReviewModal(true)} className="px-10 py-5 bg-white text-black rounded-full text-3xl font-bold">查看复盘</button></div></div>}
      {showReviewModal && <div className="fixed inset-0 z-[5000] bg-black/95 flex flex-col p-10 overflow-auto"><h2 className="text-4xl mb-6">📜 对局复盘</h2><div className="grid grid-cols-2 gap-8"><div className="bg-gray-900 p-6 rounded"><h3>初始配置</h3>{initialSeats.map(s=><div key={s.id}>{s.id+1}号: {s.role?.name} {s.role?.id==='drunk'&&`(伪:${s.charadeRole?.name})`}</div>)}</div><div className="bg-gray-900 p-6 rounded"><h3>行动日志</h3>{gameLogs.map((l,i)=><div key={i}>[{l.phase}] {l.message}</div>)}</div></div><button onClick={()=>window.location.reload()} className="mt-8 px-8 py-4 bg-red-600 rounded text-2xl self-center">彻底重开</button></div>}
      {showConfirmModal && <div className="fixed inset-0 z-[4000] bg-black/90 flex items-center justify-center"><div className="bg-gray-800 p-8 rounded-xl text-center border-2 w-[400px]"><h3 className="text-2xl font-bold mb-4">{showConfirmModal.title}</h3><p className="mb-8 text-lg">{showConfirmModal.content}</p><button onClick={showConfirmModal.onConfirm} className="px-8 py-3 bg-blue-600 rounded-xl text-xl font-bold hover:scale-105 transition">确定</button></div></div>}

      {contextMenu && <div className="absolute bg-gray-800 border-2 border-gray-500 rounded-xl shadow-2xl z-[3000] w-48 overflow-hidden" style={{top:contextMenu.y,left:contextMenu.x}}>
          {gamePhase==='day' && !seats[contextMenu.seatId].isDead && <button onClick={()=>handleMenuAction('nominate')} className="block w-full text-left px-6 py-4 hover:bg-purple-900 text-purple-300 font-bold text-lg border-b border-gray-600">🗣️ 提名</button>}
          <button onClick={()=>toggleStatus('dead')} className="block w-full text-left px-6 py-3 hover:bg-gray-700 text-lg font-medium">💀 切换死亡</button>
      </div>}
    </div>
  );
}