"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { roles, Role, Seat, LogEntry, GamePhase, WinResult, groupedRoles, typeLabels, typeColors, typeBgColors } from "./data";

// --- 辅助类型 ---
interface NightHintState { 
  isPoisoned: boolean; 
  reason?: string; 
  guide: string; 
  speak: string; 
  action?: string;
  fakeInspectionResult?: string;
}

interface NightInfoResult {
  seat: Seat;
  effectiveRole: Role;
  isPoisoned: boolean;
  reason?: string;
  guide: string;
  speak: string;
  action: string;
}

const phaseNames: Record<string, string> = {
  setup: "准备阶段", 
  check: "核对身份", 
  firstNight: "首夜", 
  day: "白天", 
  dusk: "黄昏/处决", 
  night: "夜晚", 
  dawnReport: "天亮结算", 
  gameOver: "游戏结束"
};

// --- 工具函数 ---
const formatTimer = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const getSeatPosition = (index: number, total: number = 15) => {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  // 增大半径，确保座位之间不重叠，不遮挡序号和状态标签
  // 座位图标 w-24 h-24 (96px)，加上左上角序号标签和右上角状态标签的偏移
  // 需要更大的半径来避免重叠
  const radius = 55; // 增大半径，增加座位间距，避免遮挡
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return { x: x.toFixed(2), y: y.toFixed(2) };
};

const getRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// 判断玩家是否为邪恶阵营
const isEvil = (seat: Seat): boolean => {
  if (!seat.role) return false;
  return seat.role.type === 'demon' || 
         seat.role.type === 'minion' || 
         seat.isDemonSuccessor ||
         (seat.role.id === 'recluse' && Math.random() < 0.3);
};

// --- 核心计算逻辑 ---
const calculateNightInfo = (
  seats: Seat[], 
  currentSeatId: number, 
  gamePhase: GamePhase,
  lastDuskExecution: number | null,
  fakeInspectionResult?: string
): NightInfoResult | null => {
  const targetSeat = seats.find(s => s.id === currentSeatId);
  if (!targetSeat || !targetSeat.role) return null;

  const effectiveRole = targetSeat.role.id === "drunk" ? targetSeat.charadeRole : targetSeat.role;
  if (!effectiveRole) return null;

  const isPoisoned = targetSeat.isPoisoned || targetSeat.isDrunk || targetSeat.role.id === "drunk";
  const reason = targetSeat.isPoisoned ? "中毒" : targetSeat.isDrunk ? "酒鬼" : "";
  let guide = "", speak = "", action = "";

  if (effectiveRole.id === 'imp') {
    if (gamePhase === 'firstNight') {
      const minions = seats.filter(s => s.role?.type === 'minion').map(s => `${s.id+1}号`);
      guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
      // 8. 台词融入指引内容
      speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
      action = "展示爪牙";
    } else {
      guide = "👉 让小恶魔选人杀害。";
      // 8. 台词融入指引内容
      speak = '"请选择一名玩家杀害。你可以选择任意一名活着的玩家，但不能选择自己。"';
      action = "杀害";
    }
  } else if (effectiveRole.id === 'poisoner') {
    guide = "🧪 选择一名玩家下毒。"; 
    // 8. 台词融入指引内容
    speak = '"请选择一名玩家下毒。被你下毒的玩家今晚会看到错误的信息。"'; 
    action = "投毒";
  } else if (effectiveRole.id === 'monk') {
    if (isPoisoned) {
      guide = "⚠️ [异常] 中毒/醉酒状态下无法保护玩家，但可以正常选择。"; 
      // 8. 台词融入指引内容
      speak = '"请选择一名玩家。但由于你处于中毒/醉酒状态，无法提供保护效果。"'; 
    } else {
      guide = "🛡️ 选择一名玩家保护。"; 
      // 8. 台词融入指引内容
      speak = '"请选择一名玩家保护。被你保护的玩家今晚不会被恶魔杀害，但不能保护自己。"'; 
    }
    action = "保护";
  } else if (effectiveRole.id === 'fortune_teller') {
    guide = "🔮 查验2人。若有恶魔/红罗刹->是。"; 
    // 8. 台词融入指引内容
    speak = '"请选择两名玩家查验。如果其中一人是恶魔或红罗刹，我会告诉你"是"，否则告诉你"否"。'; 
    action = "查验";
  } else if (effectiveRole.id === 'butler') {
    guide = "选择主人。"; 
    // 9. 管家手势交流
    speak = '"请通过手势选择你的主人。指向你选择的玩家，我会确认。"'; 
    action = "标记";
  } else if (effectiveRole.id === 'empath') {
    const alive = seats.filter(s => !s.isDead);
    const idx = alive.findIndex(s => s.id === currentSeatId);
    if (idx !== -1) {
      const p = alive[(idx - 1 + alive.length) % alive.length];
      const n = alive[(idx + 1) % alive.length];
      let c = 0; 
      if (isEvil(p)) c++; 
      if (isEvil(n)) c++;
      const fakeC = c===0 ? 1 : (c===2 ? 1 : (Math.random()<0.5?0:2));
      if (isPoisoned) {
        guide = `⚠️ [异常] 真实:${c}。请报伪造数据: ${fakeC} (比划${fakeC})`;
        // 8. 台词融入指引内容
        speak = `"你的左右邻居中有 ${fakeC} 名邪恶玩家。"（向他比划数字 ${fakeC}）`;
      } else {
        guide = `👂 真实信息: ${c} (比划${c})`;
        // 8. 台词融入指引内容
        speak = `"你的左右邻居中有 ${c} 名邪恶玩家。"（向他比划数字 ${c}）`;
      }
      action = "告知";
    }
  } else if (effectiveRole.id === 'washerwoman' && gamePhase==='firstNight') {
    // 洗衣妇：首夜得知一名村民的具体身份，并被告知该村民在X号或Y号（其中一个是真实的，另一个是干扰项）
    const townsfolkSeats = seats.filter(s => s.role?.type === 'townsfolk' && s.role && s.id !== currentSeatId);
    
    if(townsfolkSeats.length > 0 && seats.length >= 2) {
      // 正常时：从场上实际存在的村民中随机选择一个
      const validTownsfolk = townsfolkSeats.filter(s => s.role !== null);
      if (validTownsfolk.length === 0) {
        guide = "无此角色。示0。"; 
        speak = '"场上没有村民角色，请比划0。"';
        action = "展示";
      } else {
        const realTownsfolk = getRandom(validTownsfolk);
        const realRole = realTownsfolk.role!; // 此时确保不为null
        
        // 真实村民的座位号
        const realSeatNum = realTownsfolk.id + 1;
        
        // 选择干扰项座位（不能是自己，不能是真实村民的座位）
        const availableSeats = seats.filter(s => s.id !== currentSeatId && s.id !== realTownsfolk.id);
        const decoySeat = availableSeats.length > 0 ? getRandom(availableSeats) : realTownsfolk;
        const decoySeatNum = decoySeat.id + 1;
        
        // 随机决定真实座位和干扰项座位的显示顺序（符合游戏规则）
        const shouldSwap = Math.random() < 0.5;
        const seat1Num = shouldSwap ? decoySeatNum : realSeatNum;
        const seat2Num = shouldSwap ? realSeatNum : decoySeatNum;
        
        if (isPoisoned) {
          // 中毒时：指引处先展示正确信息，然后生成错误的干扰信息
          // 确保错误信息一定为假：选择的角色和座位号必须不匹配
          
          // 1. 随机选择一个村民角色作为错误信息中的角色
          const otherTownsfolk = validTownsfolk.filter(s => s.id !== realTownsfolk.id);
          const wrongTownsfolk = otherTownsfolk.length > 0 ? getRandom(otherTownsfolk) : realTownsfolk;
          const wrongRole = wrongTownsfolk.role!;
          
          // 2. 选择两个座位号，确保这两个座位号上的角色都不是错误信息中的角色
          // 排除：自己、真实座位、干扰项座位，以及任何座位上是错误角色的座位
          const wrongSeats = seats.filter(s => 
            s.id !== currentSeatId && 
            s.id !== realTownsfolk.id && 
            s.id !== decoySeat.id &&
            s.role?.id !== wrongRole.id  // 确保座位上的角色不是错误角色
          );
          
          // 如果过滤后没有足够的座位，则从所有座位中选择（排除自己、真实座位、干扰项座位）
          const fallbackSeats = seats.filter(s => 
            s.id !== currentSeatId && 
            s.id !== realTownsfolk.id && 
            s.id !== decoySeat.id
          );
          
          const availableWrongSeats = wrongSeats.length >= 2 ? wrongSeats : fallbackSeats;
          
          // 随机打乱座位数组，确保随机性
          const shuffledSeats = [...availableWrongSeats].sort(() => Math.random() - 0.5);
          const wrongSeat1 = shuffledSeats[0] || decoySeat;
          const wrongSeat2 = shuffledSeats.length > 1 ? shuffledSeats[1] : wrongSeat1;
          
          // 最终验证：确保两个座位号上的角色都不是错误角色（如果相同则重新选择）
          let finalWrongSeat1 = wrongSeat1;
          let finalWrongSeat2 = wrongSeat2;
          
          // 如果第一个座位上的角色恰好是错误角色，尝试找另一个
          if (finalWrongSeat1.role?.id === wrongRole.id) {
            const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
            if (alternative) finalWrongSeat1 = alternative;
          }
          
          // 如果第二个座位上的角色恰好是错误角色，尝试找另一个
          if (finalWrongSeat2.role?.id === wrongRole.id) {
            const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat2.id && s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
            if (alternative) finalWrongSeat2 = alternative;
          }
          
          // 如果两个座位相同，尝试找不同的座位
          if (finalWrongSeat1.id === finalWrongSeat2.id) {
            const differentSeat = shuffledSeats.find(s => s.id !== finalWrongSeat1.id);
            if (differentSeat) finalWrongSeat2 = differentSeat;
          }
          
          const wrongSeat1Num = finalWrongSeat1.id + 1;
          const wrongSeat2Num = finalWrongSeat2.id + 1;
          
          // 指引：显示正确信息（给说书人看）+ 错误信息（给说书人看）
          guide = `⚠️ [异常] 真实信息：【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）\n请展示错误信息：【${wrongRole.name}】在 ${wrongSeat1Num}号 或 ${wrongSeat2Num}号（${wrongSeat1Num}号是${finalWrongSeat1.role?.name || '无角色'}，${wrongSeat2Num}号是${finalWrongSeat2.role?.name || '无角色'}，均为假信息）`;
          // 台词：只显示错误信息（给玩家看）
          speak = `"你得知【${wrongRole.name}】在 ${wrongSeat1Num}号 或 ${wrongSeat2Num}号。"`;
        } else {
          // 正常时：展示真实信息（真实村民角色 + 真实座位和干扰项，顺序随机）
          guide = `👀 真实信息: 【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）`;
          speak = `"你得知【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号。"`;
        }
        action = "展示";
      }
    } else { 
      guide = "无此角色。示0。"; 
      speak = '"场上没有村民角色，请比划0。"'; 
      action = "展示";
    }
  } else if (effectiveRole.id === 'librarian' && gamePhase==='firstNight') {
    // 图书管理员：首夜得知一名外来者的具体身份，并被告知该外来者在X号或Y号（其中一个是真实的，另一个是干扰项）
    const outsiderSeats = seats.filter(s => s.role?.type === 'outsider' && s.role && s.id !== currentSeatId);
    
    if(outsiderSeats.length > 0 && seats.length >= 2) {
      // 正常时：从场上实际存在的外来者中随机选择一个
      const validOutsiders = outsiderSeats.filter(s => s.role !== null);
      if (validOutsiders.length === 0) {
        guide = "无此角色。示0。"; 
        speak = '"场上没有外来者角色，请比划0。"';
        action = "展示";
      } else {
        // 检查场上是否有酒鬼
        const hasDrunk = validOutsiders.some(s => s.role?.id === 'drunk');
        const nonDrunkOutsiders = validOutsiders.filter(s => s.role?.id !== 'drunk');
        
        // 随机选择外来者座位，保留酒鬼保护机制
        let realOutsider: Seat;
        if (hasDrunk && nonDrunkOutsiders.length > 0 && Math.random() < 0.7) {
          // 如果场上有酒鬼，70%概率选择非酒鬼的外来者（避免暴露酒鬼）
          realOutsider = getRandom(nonDrunkOutsiders);
        } else {
          // 30%概率或没有其他外来者时，从所有外来者中随机选择（包括酒鬼）
          realOutsider = getRandom(validOutsiders);
        }
        
        // 确保选择的角色确实在该座位上
        // realOutsider 本身就是从 outsiderSeats 中选择的，所以 realOutsider.role 就是该座位的角色
        const realRole = realOutsider.role!; // 此时确保不为null，且该角色确实在 realOutsider 座位上
        const realSeatNum = realOutsider.id + 1; // 真实座位号
        
        // 选择干扰项座位（不能是自己，不能是真实外来者的座位）
        const availableSeats = seats.filter(s => s.id !== currentSeatId && s.id !== realOutsider.id);
        const decoySeat = availableSeats.length > 0 ? getRandom(availableSeats) : realOutsider;
        const decoySeatNum = decoySeat.id + 1;
        
        // 随机决定真实座位和干扰项座位的显示顺序（符合游戏规则）
        const shouldSwap = Math.random() < 0.5;
        const seat1Num = shouldSwap ? decoySeatNum : realSeatNum;
        const seat2Num = shouldSwap ? realSeatNum : decoySeatNum;
      
        if (isPoisoned) {
          // 中毒时：指引处先展示正确信息，然后生成错误的干扰信息
          // 确保错误信息一定为假：选择的角色和座位号必须不匹配
          
          // 1. 获取所有可能的外来者角色列表
          const outsiderRoles = roles.filter(r => r.type === 'outsider' && r.id !== effectiveRole.id);
          
          // 2. 随机选择一个外来者角色作为错误信息中的角色
          const otherRoles = outsiderRoles.filter(r => r.id !== realRole.id);
          const wrongRole = otherRoles.length > 0 ? getRandom(otherRoles) : realRole;
          
          // 3. 选择两个座位号，确保这两个座位号上的角色都不是错误信息中的角色
          // 排除：自己、真实座位、干扰项座位，以及任何座位上是错误角色的座位
          const wrongSeats = seats.filter(s => 
            s.id !== currentSeatId && 
            s.id !== realOutsider.id && 
            s.id !== decoySeat.id &&
            s.role?.id !== wrongRole.id  // 确保座位上的角色不是错误角色
          );
          
          // 如果过滤后没有足够的座位，则从所有座位中选择（排除自己、真实座位、干扰项座位）
          const fallbackSeats = seats.filter(s => 
            s.id !== currentSeatId && 
            s.id !== realOutsider.id && 
            s.id !== decoySeat.id
          );
          
          const availableWrongSeats = wrongSeats.length >= 2 ? wrongSeats : fallbackSeats;
          
          // 随机打乱座位数组，确保随机性
          const shuffledSeats = [...availableWrongSeats].sort(() => Math.random() - 0.5);
          let finalWrongSeat1 = shuffledSeats[0] || decoySeat;
          let finalWrongSeat2 = shuffledSeats.length > 1 ? shuffledSeats[1] : finalWrongSeat1;
          
          // 最终验证：确保两个座位号上的角色都不是错误角色
          if (finalWrongSeat1.role?.id === wrongRole.id) {
            const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
            if (alternative) finalWrongSeat1 = alternative;
          }
          
          if (finalWrongSeat2.role?.id === wrongRole.id) {
            const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat2.id && s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
            if (alternative) finalWrongSeat2 = alternative;
          }
          
          // 如果两个座位相同，尝试找不同的座位
          if (finalWrongSeat1.id === finalWrongSeat2.id) {
            const differentSeat = shuffledSeats.find(s => s.id !== finalWrongSeat1.id);
            if (differentSeat) finalWrongSeat2 = differentSeat;
          }
          
          // 指引：显示正确信息（给说书人看）+ 错误信息（给说书人看）
          guide = `⚠️ [异常] 真实信息：【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）\n请展示错误信息：【${wrongRole.name}】在 ${finalWrongSeat1.id+1}号 或 ${finalWrongSeat2.id+1}号（${finalWrongSeat1.id+1}号是${finalWrongSeat1.role?.name || '无角色'}，${finalWrongSeat2.id+1}号是${finalWrongSeat2.role?.name || '无角色'}，均为假信息）`;
          // 台词：只显示错误信息（给玩家看）
          speak = `"你得知【${wrongRole.name}】在 ${finalWrongSeat1.id+1}号 或 ${finalWrongSeat2.id+1}号。"`;
        } else {
          // 正常时：展示真实信息（真实外来者角色 + 真实座位和干扰项，顺序随机）
          guide = `👀 真实信息: 【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）`;
          speak = `"你得知【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号。"`;
        }
        action = "展示";
      }
    } else { 
      guide = "无外来者。示0。"; 
      speak = '"场上没有外来者角色，请比划0。"'; 
    }
    action = "展示";
  } else if (effectiveRole.id === 'investigator' && gamePhase==='firstNight') {
    // 调查员：首夜得知一名爪牙的具体身份，并被告知该爪牙在X号或Y号（其中一个是真实的，另一个是干扰项）
    const minionSeats = seats.filter(s => s.role?.type === 'minion' && s.role && s.id !== currentSeatId);
    
    if(minionSeats.length > 0 && seats.length >= 2) {
      // 正常时：随机选择一个实际存在的爪牙，确保角色存在
      const validMinions = minionSeats.filter(s => s.role !== null);
      if (validMinions.length === 0) {
        guide = "无此角色。示0。"; 
        speak = '"场上没有爪牙角色，请比划0。"';
        action = "展示";
      } else {
        const realMinion = getRandom(validMinions);
        const realRole = realMinion.role!; // 此时确保不为null
        
        // 真实爪牙的座位号
        const realSeatNum = realMinion.id + 1;
        
        // 选择干扰项座位：从全场所有座位中随机选择（不能是自己，不能是真实爪牙的座位）
        // 确保不偏向任何阵营，完全随机选择
        const availableSeats = seats.filter(s => s.id !== currentSeatId && s.id !== realMinion.id);
        // 使用 getRandom 函数确保完全随机，不偏向任何阵营
        const decoySeat = availableSeats.length > 0 ? getRandom(availableSeats) : realMinion;
        const decoySeatNum = decoySeat.id + 1;
        
        // 随机决定真实座位和干扰项座位的显示顺序（符合游戏规则）
        const shouldSwap = Math.random() < 0.5;
        const seat1Num = shouldSwap ? decoySeatNum : realSeatNum;
        const seat2Num = shouldSwap ? realSeatNum : decoySeatNum;
        
        if (isPoisoned) {
          // 中毒时：指引处先展示正确信息，然后生成错误的干扰信息
          // 确保错误信息一定为假：选择的角色和座位号必须不匹配
          
          // 1. 随机选择一个爪牙角色作为错误信息中的角色
          const allMinionRoles = roles.filter(r => r.type === 'minion' && r.id !== effectiveRole.id);
          const wrongRole = allMinionRoles.filter(r => r.id !== realRole.id).length > 0 
            ? getRandom(allMinionRoles.filter(r => r.id !== realRole.id))
            : getRandom(allMinionRoles);
          
          // 2. 选择错误的座位号：只从善良玩家中选择（避开所有邪恶阵营玩家）
          // 同时确保这些座位号上的角色都不是错误信息中的角色
          // 善良玩家包括：townsfolk（镇民）和 outsider（外来者）
          // 邪恶玩家包括：minion（爪牙）、demon（恶魔）、isDemonSuccessor（恶魔继任者）
          const goodSeats = seats.filter(s => {
            if (!s.role || s.id === currentSeatId || s.id === realMinion.id || s.id === decoySeat.id) return false;
            // 排除邪恶阵营
            if (isEvil(s)) return false;
            // 只保留善良玩家（镇民和外来者）
            // 同时确保座位上的角色不是错误角色（因为错误角色是爪牙，善良玩家不可能是爪牙，所以这个检查是多余的，但为了逻辑清晰保留）
            return (s.role.type === 'townsfolk' || s.role.type === 'outsider') && s.role.id !== wrongRole.id;
          });
          
          // 如果过滤后没有足够的座位，则从所有善良玩家中选择（排除自己、真实座位、干扰项座位）
          const fallbackGoodSeats = seats.filter(s => {
            if (!s.role || s.id === currentSeatId || s.id === realMinion.id || s.id === decoySeat.id) return false;
            if (isEvil(s)) return false;
            return s.role.type === 'townsfolk' || s.role.type === 'outsider';
          });
          
          const availableGoodSeats = goodSeats.length >= 2 ? goodSeats : fallbackGoodSeats;
          
          // 随机打乱座位数组，确保随机性
          const shuffledSeats = [...availableGoodSeats].sort(() => Math.random() - 0.5);
          let finalWrongSeat1 = shuffledSeats[0] || decoySeat;
          let finalWrongSeat2 = shuffledSeats.length > 1 ? shuffledSeats[1] : finalWrongSeat1;
          
          // 最终验证：确保两个座位号上的角色都不是错误角色
          if (finalWrongSeat1.role?.id === wrongRole.id) {
            const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
            if (alternative) finalWrongSeat1 = alternative;
          }
          
          if (finalWrongSeat2.role?.id === wrongRole.id) {
            const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat2.id && s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
            if (alternative) finalWrongSeat2 = alternative;
          }
          
          // 如果两个座位相同，尝试找不同的座位
          if (finalWrongSeat1.id === finalWrongSeat2.id) {
            const differentSeat = shuffledSeats.find(s => s.id !== finalWrongSeat1.id);
            if (differentSeat) finalWrongSeat2 = differentSeat;
          }
          
          const wrongSeat1Num = finalWrongSeat1.id + 1;
          const wrongSeat2Num = finalWrongSeat2.id + 1;
          
          // 指引：显示正确信息（给说书人看）+ 错误信息（给说书人看）
          guide = `⚠️ [异常] 真实信息：【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）\n请展示错误信息：【${wrongRole.name}】在 ${wrongSeat1Num}号 或 ${wrongSeat2Num}号（${wrongSeat1Num}号是${finalWrongSeat1.role?.name || '无角色'}，${wrongSeat2Num}号是${finalWrongSeat2.role?.name || '无角色'}，均为假信息）`;
          // 台词：只显示错误信息（给玩家看）
          speak = `"你得知【${wrongRole.name}】在 ${wrongSeat1Num}号 或 ${wrongSeat2Num}号。"`;
        } else {
          // 正常时：展示真实信息（真实爪牙角色 + 真实座位和干扰项，顺序随机）
          guide = `👀 真实信息: 【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）`;
          speak = `"你得知【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号。"`;
        }
        action = "展示";
      }
    } else { 
      guide = "无此角色。示0。"; 
      speak = '"场上没有爪牙角色，请比划0。"'; 
      action = "展示";
    }
  } else if (effectiveRole.id === 'chef' && gamePhase==='firstNight') {
    let pairs = 0;
    for (let i = 0; i < seats.length; i++) {
      const next = (i + 1) % seats.length;
      if (isEvil(seats[i]) && isEvil(seats[next]) && !seats[i].isDead && !seats[next].isDead) {
        pairs++;
      }
    }
    if (isPoisoned) {
      const fakePairs = pairs === 0 ? 1 : (pairs >= 2 ? pairs - 1 : pairs + 1);
      guide = `⚠️ [异常] 真实:${pairs}对。请报: ${fakePairs}对`;
      // 8. 台词融入指引内容
      speak = `"场上有 ${fakePairs} 对邪恶玩家相邻而坐。"（向他比划数字 ${fakePairs}）`;
    } else {
      guide = `👀 真实信息: ${pairs}对邪恶相邻`;
      // 8. 台词融入指引内容
      speak = `"场上有 ${pairs} 对邪恶玩家相邻而坐。"（向他比划数字 ${pairs}）`;
    }
    action = "告知";
  } else if (effectiveRole.id === 'undertaker' && gamePhase !== 'firstNight') {
    // 10. 送葬者查看"上一个黄昏"的处决记录
    if (lastDuskExecution !== null) {
      const executed = seats.find(s => s.id === lastDuskExecution);
      if (executed) {
        guide = `👀 真实信息: 上一个黄昏被处决的是【${executed.role?.name}】`;
        // 8. 台词融入指引内容
        speak = `"上一个黄昏被处决的玩家是【${executed.role?.name}】。"`;
      } else {
        guide = "上一个黄昏无人被处决。";
        // 8. 台词融入指引内容
        speak = '"上一个黄昏无人被处决。"';
      }
    } else {
      guide = "上一个黄昏无人被处决。";
      // 8. 台词融入指引内容
      speak = '"上一个黄昏无人被处决。"';
    }
    action = "告知";
  } else if (effectiveRole.id === 'spy') {
    guide = "📖 间谍查看魔典。"; 
    speak = '"请查看魔典。"'; 
    action="展示";
  } else if (effectiveRole.id === 'ravenkeeper') {
    if (!targetSeat.isDead) { 
      guide = "你还活着。"; 
      speak = "（摇头示意无效）"; 
    } else { 
      guide = "查验一身份。"; 
      speak = '"请选择一名玩家。"'; 
    }
    action = "查验";
  } else {
    guide = "💤 无行动。"; 
    speak = "（无）"; 
    action="跳过";
  }
  
  // 修复：首晚小恶魔没有技能，将 nightActionType 设置为 'none'
  let finalEffectiveRole = effectiveRole;
  if (effectiveRole.id === 'imp' && gamePhase === 'firstNight') {
    finalEffectiveRole = { ...effectiveRole, nightActionType: 'none' };
  }
  
  return { seat: targetSeat, effectiveRole: finalEffectiveRole, isPoisoned, reason, guide, speak, action };
};

export default function Home() {
  // ===========================
  //      STATE 定义 (完整，前置)
  // ===========================
  const [mounted, setMounted] = useState(false);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [initialSeats, setInitialSeats] = useState<Seat[]>([]);
  
  const [gamePhase, setGamePhase] = useState<GamePhase>("setup");
  const [nightCount, setNightCount] = useState(1);
  const [deadThisNight, setDeadThisNight] = useState<number[]>([]); // 改为存储玩家ID
  const [executedPlayerId, setExecutedPlayerId] = useState<number | null>(null);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
  const [winResult, setWinResult] = useState<WinResult>(null);
  
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [timer, setTimer] = useState(0);
  
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; seatId: number } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  
  const [wakeQueueIds, setWakeQueueIds] = useState<number[]>([]);
  const [currentWakeIndex, setCurrentWakeIndex] = useState(0);
  const [selectedActionTargets, setSelectedActionTargets] = useState<number[]>([]);
  const [inspectionResult, setInspectionResult] = useState<string | null>(null);
  const [currentHint, setCurrentHint] = useState<NightHintState>({ isPoisoned: false, guide: "", speak: "" });
  
  // 保存每个角色的 hint 信息，用于"上一步"时恢复（不重新生成）
  const hintCacheRef = useRef<Map<string, NightHintState>>(new Map());

  const [showShootModal, setShowShootModal] = useState<number | null>(null);
  const [showNominateModal, setShowNominateModal] = useState<number | null>(null);
  const [showDayActionModal, setShowDayActionModal] = useState<{type: 'slayer'|'nominate', sourceId: number} | null>(null);
  const [showDrunkModal, setShowDrunkModal] = useState<number | null>(null);
  const [showVirginTriggerModal, setShowVirginTriggerModal] = useState<{source: Seat, target: Seat} | null>(null);
  const [showRavenkeeperFakeModal, setShowRavenkeeperFakeModal] = useState<number | null>(null);
  const [showRavenkeeperResultModal, setShowRavenkeeperResultModal] = useState<{targetId: number, roleName: string, isFake: boolean} | null>(null);
  const [showVoteInputModal, setShowVoteInputModal] = useState<number | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showExecutionResultModal, setShowExecutionResultModal] = useState<{message: string} | null>(null);
  const [showShootResultModal, setShowShootResultModal] = useState<{message: string, isDemonDead: boolean} | null>(null);
  const [showKillConfirmModal, setShowKillConfirmModal] = useState<number | null>(null); // 恶魔确认杀死玩家
  const [showPoisonConfirmModal, setShowPoisonConfirmModal] = useState<number | null>(null); // 投毒者确认下毒
  const [showPoisonEvilConfirmModal, setShowPoisonEvilConfirmModal] = useState<number | null>(null); // 投毒者确认对邪恶玩家下毒
  const [showNightDeathReportModal, setShowNightDeathReportModal] = useState<string | null>(null); // 夜晚死亡报告

  const seatsRef = useRef(seats);
  const fakeInspectionResultRef = useRef<string | null>(null);
  
  // 历史记录用于"上一步"功能
  const [history, setHistory] = useState<Array<{
    seats: Seat[];
    gamePhase: GamePhase;
    nightCount: number;
    executedPlayerId: number | null;
    wakeQueueIds: number[];
    currentWakeIndex: number;
    selectedActionTargets: number[];
    gameLogs: LogEntry[];
    currentHint?: NightHintState; // 保存 hint 信息
  }>>([]);
  
  // 提名记录：记录谁提名了谁
  const [nominationRecords, setNominationRecords] = useState<{
    nominators: Set<number>; // 已经提名过的玩家
    nominees: Set<number>; // 已经被提名过的玩家
  }>({ nominators: new Set(), nominees: new Set() });
  
  // 上一个黄昏的处决记录（用于送葬者）
  const [lastDuskExecution, setLastDuskExecution] = useState<number | null>(null);
  
  // 使用ref存储最新状态，避免Hook依赖问题
  const gameStateRef = useRef({
    seats,
    gamePhase,
    nightCount,
    executedPlayerId,
    wakeQueueIds,
    currentWakeIndex,
    selectedActionTargets,
    gameLogs
  });
  
  // 更新ref
  useEffect(() => {
    gameStateRef.current = {
      seats,
      gamePhase,
      nightCount,
      executedPlayerId,
      wakeQueueIds,
      currentWakeIndex,
      selectedActionTargets,
      gameLogs
    };
  }, [seats, gamePhase, nightCount, executedPlayerId, wakeQueueIds, currentWakeIndex, selectedActionTargets, gameLogs]);

  // --- Effects ---
  useEffect(() => {
      setMounted(true);
      setSeats(Array.from({ length: 15 }, (_, i) => ({ 
      id: i, 
      role: null, 
      charadeRole: null, 
      isDead: false, 
      isDrunk: false, 
      isPoisoned: false, 
      isProtected: false, 
      protectedBy: null,
      isRedHerring: false, 
      isSentenced: false, 
      masterId: null, 
      hasUsedSlayerAbility: false, 
      hasUsedVirginAbility: false, 
      isDemonSuccessor: false, 
      statusDetails: []
      })));
  }, []);

  useEffect(() => { 
    setTimer(0); 
  }, [gamePhase]);
  
  useEffect(() => { 
      if(!mounted) return;
      const i = setInterval(() => setTimer(t => t + 1), 1000); 
      return () => clearInterval(i); 
  }, [mounted]);
  
  useEffect(() => { 
    seatsRef.current = seats; 
  }, [seats]);

  const addLog = useCallback((msg: string) => {
    setGameLogs(p => [...p, { day: nightCount, phase: gamePhase, message: msg }]);
  }, [nightCount, gamePhase]);

  // 添加日志并去重：每个玩家每晚只保留最后一次行动
  const addLogWithDeduplication = useCallback((msg: string, playerId?: number, roleName?: string) => {
    setGameLogs(prev => {
      // 如果提供了玩家ID和角色名，先删除该玩家在该阶段之前的日志
      if (playerId !== undefined && roleName) {
        const filtered = prev.filter(log => 
          !(log.message.includes(`${playerId+1}号(${roleName})`) && log.phase === gamePhase)
        );
        return [...filtered, { day: nightCount, phase: gamePhase, message: msg }];
      }
      // 否则直接添加
      return [...prev, { day: nightCount, phase: gamePhase, message: msg }];
    });
  }, [nightCount, gamePhase]);

  const nightInfo = useMemo(() => {
    if ((gamePhase === "firstNight" || gamePhase === "night") && wakeQueueIds.length > 0) {
      return calculateNightInfo(seats, wakeQueueIds[currentWakeIndex], gamePhase, lastDuskExecution, fakeInspectionResultRef.current || undefined);
    }
    return null;
  }, [seats, currentWakeIndex, gamePhase, wakeQueueIds, lastDuskExecution]);

  useEffect(() => {
    if (nightInfo) {
      // 生成缓存 key：用于"上一步"时恢复 hint，不重新生成
      const hintKey = `${gamePhase}-${currentWakeIndex}-${nightInfo.seat.id}`;
      
      // 检查缓存中是否有该角色的 hint（用于"上一步"时恢复）
      const cachedHint = hintCacheRef.current.get(hintKey);
      if (cachedHint) {
        setCurrentHint(cachedHint);
        if (cachedHint.fakeInspectionResult) {
          fakeInspectionResultRef.current = cachedHint.fakeInspectionResult;
        }
        return; // 使用缓存的 hint，不重新计算
      }
      
      // 没有缓存，重新计算 hint
      let fakeResult = currentHint.fakeInspectionResult;
      if (nightInfo.effectiveRole.id === 'fortune_teller' && nightInfo.isPoisoned && !fakeResult) {
        fakeResult = Math.random() < 0.5 ? "✅ 是" : "❌ 否";
        fakeInspectionResultRef.current = fakeResult;
      } else if (nightInfo.effectiveRole.id !== 'fortune_teller' || !nightInfo.isPoisoned) {
        fakeInspectionResultRef.current = null;
      }

      const newHint: NightHintState = { 
        isPoisoned: nightInfo.isPoisoned, 
        reason: nightInfo.reason, 
        guide: nightInfo.guide, 
        speak: nightInfo.speak,
        fakeInspectionResult: fakeResult
      };
      
      // 保存到缓存
      hintCacheRef.current.set(hintKey, newHint);
      setCurrentHint(newHint);
      
      if (selectedActionTargets.length > 0 && seats.find(s=>s.id===selectedActionTargets[0])?.id !== wakeQueueIds[currentWakeIndex]) {
        setSelectedActionTargets([]); 
        setInspectionResult(null);
        fakeInspectionResultRef.current = null;
      }
    }
  }, [currentWakeIndex, gamePhase, nightInfo, seats, selectedActionTargets, currentHint.fakeInspectionResult]);

  // 检查游戏结束条件
  const checkGameOver = useCallback((updatedSeats: Seat[]) => {
    // 10. 任意状态下，小恶魔被死亡或被标记死亡，游戏立即结束
    const demon = updatedSeats.find(s => 
      ((s.role?.type === 'demon' || s.isDemonSuccessor) && s.isDead)
    );
    if (demon) {
      setWinResult('good');
      setGamePhase('gameOver');
      addLog("游戏结束：小恶魔死亡，好人胜利");
      return true;
    }
    
    const aliveCount = updatedSeats.filter(s => !s.isDead).length;
    const aliveDemon = updatedSeats.find(s => 
      (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead
    );
    
    if (!aliveDemon) {
      const scarletWoman = updatedSeats.find(s => 
        s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
      );
      if (!scarletWoman) {
        setWinResult('good');
        setGamePhase('gameOver');
        addLog("游戏结束：恶魔死亡，好人胜利");
        return true;
      }
    }
    
    // 当场上存活玩家少于3人时，宣布邪恶阵营获胜
    if (aliveCount < 3) {
      setWinResult('evil');
      setGamePhase('gameOver');
      addLog("游戏结束：存活玩家少于3人，邪恶胜利");
      return true;
    }
    
    const mayor = updatedSeats.find(s => s.role?.id === 'mayor' && !s.isDead);
    if (aliveCount === 3 && mayor && gamePhase === 'day') {
      setWinResult('good');
      setGamePhase('gameOver');
      addLog("游戏结束：3人存活且无人被处决，好人胜利");
      return true;
    }
    
    return false;
  }, [addLog, gamePhase]);

  if (!mounted) return null;

  // --- Handlers ---
  const isTargetDisabled = (s: Seat) => {
    if (!nightInfo) return true;
    const rid = nightInfo.effectiveRole.id;
    if (rid === 'monk' && s.id === nightInfo.seat.id) return true;
    if (rid === 'poisoner' && s.isDead) return true;
    if (rid === 'ravenkeeper' && !nightInfo.seat.isDead) return true;
    // 7. 修复小恶魔选择问题 - 首夜不能选人，非首夜可以选择
    if (rid === 'imp' && gamePhase === 'firstNight') return true;
    // 小恶魔可以选择自己（用于身份转移）
    // 管家不能选择自己作为主人
    if (rid === 'butler' && s.id === nightInfo.seat.id) return true;
    return false;
  };

  const handleSeatClick = (id: number) => {
    if(gamePhase==='setup') {
      if(selectedRole) {
        if(seats.some(s=>s.role?.id===selectedRole.id)) {
          alert("该角色已入座");
          return;
        }
        setSeats(p=>p.map(s=>s.id===id?{...s,role:selectedRole}:s)); 
        setSelectedRole(null);
      } else {
        setSeats(p=>p.map(s=>s.id===id?{...s,role:null}:s));
      }
    }
  };

  const handlePreStartNight = () => {
      const active = seats.filter(s => s.role);
    if (active.length === 0) {
      alert("请先安排座位");
      return;
    }
    const compact = active.map((s, i) => ({ ...s, id: i }));
      setSeats(compact);

    setTimeout(() => {
      const drunk = compact.find(s => s.role?.id === "drunk" && !s.charadeRole);
      if(drunk) { 
        setShowDrunkModal(drunk.id); 
        return; 
      }
      
      const withRed = [...compact];
      if(!withRed.some(s => s.isRedHerring)) {
        const good = withRed.filter(s => ["townsfolk","outsider"].includes(s.role?.type || ""));
        if(good.length > 0) {
          const t = getRandom(good);
          withRed[t.id] = { 
            ...withRed[t.id], 
            isRedHerring: true, 
            statusDetails: [...withRed[t.id].statusDetails, "红罗刹"] 
          };
        }
      }
      setSeats(withRed); 
      setInitialSeats(JSON.parse(JSON.stringify(withRed))); 
      setGamePhase("check");
    }, 100);
  };

  const confirmDrunkCharade = (r: Role) => {
    // 立即更新座位显示
    setSeats(p => {
      const updated = p.map(s => s.id === showDrunkModal ? { ...s, charadeRole: r, isDrunk: true } : s);
      setShowDrunkModal(null);
      setTimeout(() => {
        const active = updated.filter(s => s.role);
        const compact = active.map((s, i) => ({ ...s, id: i }));
        const withRed = [...compact];
        if(!withRed.some(s => s.isRedHerring)) {
          const good = withRed.filter(s => ["townsfolk","outsider"].includes(s.role?.type || ""));
          if(good.length > 0) {
            const t = getRandom(good);
            withRed[t.id] = { 
              ...withRed[t.id], 
              isRedHerring: true, 
              statusDetails: [...withRed[t.id].statusDetails, "红罗刹"] 
            };
          }
        }
        setSeats(withRed); 
        setInitialSeats(JSON.parse(JSON.stringify(withRed))); 
        setGamePhase("check");
      }, 100);
      return updated;
    });
  };

  const startNight = (isFirst: boolean) => {
    // 保存历史记录
    saveHistory();
    
      if(isFirst) setStartTime(new Date());
    setSeats(p => p.map(s => ({
      ...s, 
      isPoisoned: false, 
      isProtected: false,
      protectedBy: null,
      voteCount: undefined, 
      isCandidate: false
    })));
      setDeadThisNight([]);
    fakeInspectionResultRef.current = null;
    
    const q = seats.filter(s => s.role).filter(s => !s.isDead || s.role?.id === 'ravenkeeper').sort((a,b) => {
      const ra = a.role?.id === 'drunk' ? a.charadeRole : a.role;
      const rb = b.role?.id === 'drunk' ? b.charadeRole : b.role;
      return (isFirst ? (ra?.firstNightOrder??0) : (ra?.otherNightOrder??0)) - (isFirst ? (rb?.firstNightOrder??0) : (rb?.otherNightOrder??0));
    });
    const validQueue = q.filter(s => {
      const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
      // 6. 跳过在夜晚死亡的玩家（小恶魔杀害的玩家），但守鸦人死亡的当晚需要被唤醒
      if (s.isDead && !isFirst && s.role?.id !== 'ravenkeeper') {
        return false;
      }
      return isFirst ? (r?.firstNightOrder ?? 0) > 0 : (r?.otherNightOrder ?? 0) > 0;
    });
    setWakeQueueIds(validQueue.map(s => s.id)); 
    setCurrentWakeIndex(0); 
    setSelectedActionTargets([]);
    setInspectionResult(null);
    setGamePhase(isFirst ? "firstNight" : "night"); 
    if(!isFirst) setNightCount(n => n + 1);
  };

  const toggleTarget = (id: number) => {
      if(!nightInfo) return;
    
    // 保存历史记录
    saveHistory();
    
    const max = nightInfo.effectiveRole.id==='fortune_teller' ? 2 : 1;
    let newT = [...selectedActionTargets];
    
    if (newT.includes(id)) {
      newT = newT.filter(t => t !== id);
    } else {
      if (max === 1) {
        newT = [id]; 
      } else {
        if (newT.length >= max) {
          newT.shift();
        }
        newT.push(id);
      }
    }
    
      setSelectedActionTargets(newT);
    
    // 投毒者选择目标后立即显示确认弹窗
    if(nightInfo.effectiveRole.id === 'poisoner' && nightInfo.effectiveRole.nightActionType === 'poison' && newT.length > 0) {
      const targetId = newT[newT.length - 1];
      const target = seats.find(s => s.id === targetId);
      const isEvilPlayer = target && (['minion','demon'].includes(target.role?.type||'') || target.isDemonSuccessor);
      if(isEvilPlayer) {
        setShowPoisonEvilConfirmModal(targetId);
      } else {
        setShowPoisonConfirmModal(targetId);
      }
      // 只更新高亮，不执行下毒，等待确认
      setSeats(p => p.map(s => ({...s, isPoisoned: false})));
      return;
    }
    
    // 小恶魔选择目标后立即显示确认弹窗
    if(nightInfo.effectiveRole.id === 'imp' && nightInfo.effectiveRole.nightActionType === 'kill' && gamePhase !== 'firstNight' && newT.length > 0) {
      const targetId = newT[newT.length - 1];
      setShowKillConfirmModal(targetId);
      return;
    }
    
    // 1. 统一高亮显示 - 所有选中操作都有视觉反馈
    if(newT.length > 0) {
      const tid = newT[newT.length - 1];
      const action = nightInfo.effectiveRole.nightActionType;
      if(action === 'poison') {
        setSeats(p => p.map(s => ({...s, isPoisoned: s.id === tid})));
        if (nightInfo) {
          // 7. 行动日志去重：移除该玩家之前的操作记录，只保留最新的
          setGameLogs(prev => {
            const filtered = prev.filter(log => 
              !(log.message.includes(`${nightInfo.seat.id+1}号(投毒者)`) && log.phase === gamePhase)
            );
            return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(投毒者) 对 ${tid+1}号 下毒` }];
          });
        }
      }
      if(action === 'protect') {
        if (nightInfo) {
          // 使用nightInfo.isPoisoned和seats状态双重检查，确保判断准确
          const monkSeat = seats.find(s => s.id === nightInfo.seat.id);
          const isMonkPoisoned = nightInfo.isPoisoned || 
                                 (monkSeat ? (monkSeat.isPoisoned || monkSeat.isDrunk || monkSeat.role?.id === "drunk") : false);
          
          // 如果僧侣中毒/醉酒，绝对不能设置保护效果，但可以正常选择玩家
          if (isMonkPoisoned) {
            // 强制清除所有保护状态，确保不会有任何保护效果
            setSeats(p => p.map(s => {
              // 如果这个玩家是被当前僧侣保护的，清除保护
              if (s.protectedBy === nightInfo.seat.id) {
                return {...s, isProtected: false, protectedBy: null};
              }
              return s;
            }));
            // 记录日志：选择但无保护效果
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(僧侣)`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(僧侣) 选择保护 ${tid+1}号，但中毒/醉酒状态下无保护效果` }];
            });
          } else {
            // 健康状态下正常保护：先清除所有保护，然后只设置目标玩家的保护
            setSeats(p => {
              const updated = p.map(s => ({...s, isProtected: false, protectedBy: null}));
              return updated.map(s => s.id === tid ? {...s, isProtected: true, protectedBy: nightInfo.seat.id} : s);
            });
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(僧侣)`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(僧侣) 保护 ${tid+1}号` }];
            });
          }
        }
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'butler') {
        setSeats(p => p.map(s => ({...s, masterId: tid})));
        if (nightInfo) {
          // 7. 行动日志去重
          setGameLogs(prev => {
            const filtered = prev.filter(log => 
              !(log.message.includes(`${nightInfo.seat.id+1}号(管家)`) && log.phase === gamePhase)
            );
            return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(管家) 选择 ${tid+1}号 为主人` }];
          });
        }
      }
      // 小恶魔需要确认，不立即执行死亡
      if(action === 'kill' && nightInfo.effectiveRole.id === 'imp' && gamePhase !== 'firstNight') {
        // 只更新选择，不执行杀死，等待确认
      }
    } else {
      const action = nightInfo.effectiveRole.nightActionType;
      if(action === 'poison') {
        setSeats(p => p.map(s => ({...s, isPoisoned: false})));
      }
      if(action === 'protect') {
        setSeats(p => p.map(s => ({...s, isProtected: false, protectedBy: null})));
      }
    }
    
    if(nightInfo.effectiveRole.nightActionType === 'inspect' && newT.length === 2) {
      if (currentHint.isPoisoned && currentHint.fakeInspectionResult) {
        setInspectionResult(currentHint.fakeInspectionResult);
      } else {
        // 占卜师判断逻辑：查验2人，若有恶魔/红罗刹则显示"是"，其他显示"否"
        const hasEvil = newT.some(tid => { 
          const t = seats.find(x=>x.id===tid); 
          if (!t || !t.role) return false;
          // 检查是否是恶魔
          const isDemon = t.role.type === 'demon' || t.isDemonSuccessor;
          // 检查是否是红罗刹
          const isRedHerring = t.isRedHerring === true;
          return isDemon || isRedHerring;
        });
        setInspectionResult(hasEvil ? "✅ 是" : "❌ 否");
      }
      if (nightInfo) {
        // 行动日志去重：占卜师每次选择都更新日志，只保留最后一次
        addLogWithDeduplication(
          `${nightInfo.seat.id+1}号(占卜师) 查验 ${newT.map(t=>t+1).join('号、')}号 -> ${inspectionResult || (currentHint.isPoisoned && currentHint.fakeInspectionResult ? currentHint.fakeInspectionResult : '')}`,
          nightInfo.seat.id,
          '占卜师'
        );
      }
    }
    
    if(nightInfo.effectiveRole.nightActionType === 'inspect_death' && newT.length === 1) {
      const t = seats.find(s=>s.id===newT[0]);
      if (!currentHint.isPoisoned) {
        // 健康状态：直接弹出结果弹窗显示真实身份
        if (t?.role) {
          setShowRavenkeeperResultModal({
            targetId: newT[0],
            roleName: t.role.name,
            isFake: false
          });
        }
      } else {
        // 中毒/醉酒状态：先弹出选择假身份的弹窗
        setShowRavenkeeperFakeModal(newT[0]);
      }
    }
  };

  const handleConfirmAction = () => {
    if(!nightInfo) return;
    
    // 检查是否有待确认的操作（投毒者和恶魔的确认弹窗已在toggleTarget中处理）
    // 如果有打开的确认弹窗，不继续流程
    if(showKillConfirmModal !== null || showPoisonConfirmModal !== null || showPoisonEvilConfirmModal !== null || 
       showRavenkeeperResultModal !== null || showRavenkeeperFakeModal !== null) {
      return;
    }
    
    // 没有待确认的操作，继续流程
    continueToNextAction();
  };
  
  const continueToNextAction = () => {
    // 保存历史记录
    saveHistory();
    
    // 检查是否有玩家在夜晚死亡，需要跳过他们的环节
    const currentDead = seats.filter(s => s.isDead);
    setWakeQueueIds(prev => prev.filter(id => !currentDead.find(d => d.id === id)));
    
    // 如果当前玩家已死亡，跳过到下一个
    const currentId = wakeQueueIds[currentWakeIndex];
    if (currentId !== undefined && seats.find(s => s.id === currentId)?.isDead) {
      setCurrentWakeIndex(p => p + 1);
      setInspectionResult(null);
      setSelectedActionTargets([]);
      fakeInspectionResultRef.current = null;
      return;
    }
    
    if(currentWakeIndex < wakeQueueIds.length - 1) { 
      setCurrentWakeIndex(p => p + 1); 
      setInspectionResult(null);
      setSelectedActionTargets([]);
      fakeInspectionResultRef.current = null;
    } else {
      // 夜晚结束，显示死亡报告
      // 检测夜晚期间死亡的玩家（通过deadThisNight记录）
      if(deadThisNight.length > 0) {
        const deadNames = deadThisNight.map(id => `${id+1}号`).join('、');
        setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
      } else {
        setShowNightDeathReportModal("昨天是个平安夜");
      }
    }
  };
  
  // 确认夜晚死亡报告后进入白天
  const confirmNightDeathReport = () => {
    setShowNightDeathReportModal(null);
    setDeadThisNight([]); // 清空夜晚死亡记录
    setGamePhase("day");
  };
  
  // 确认杀死玩家
  const confirmKill = () => {
    if(!nightInfo || showKillConfirmModal === null) return;
    const targetId = showKillConfirmModal;
    const impSeat = nightInfo.seat;
    
    // 如果小恶魔选择自己，触发身份转移
    if (targetId === impSeat.id && nightInfo.effectiveRole.id === 'imp') {
      // 找到所有活着的爪牙
      const aliveMinions = seats.filter(s => 
        s.role?.type === 'minion' && 
        !s.isDead && 
        s.id !== impSeat.id
      );
      
      if (aliveMinions.length > 0) {
        // 随机选择一个爪牙作为新的小恶魔
        const newImp = getRandom(aliveMinions);
        const newImpRole = roles.find(r => r.id === 'imp');
        
        setSeats(p => {
          const updated = p.map(s => {
            if (s.id === impSeat.id) {
              // 原小恶魔死亡
              return { ...s, isDead: true };
            } else if (s.id === newImp.id) {
              // 新小恶魔：标记为恶魔继任者，更新角色为小恶魔，添加"小恶魔（传）"标记
              const statusDetails = [...(s.statusDetails || []), '小恶魔（传）'];
              return { 
                ...s, 
                role: newImpRole || s.role,
                isDemonSuccessor: true,
                statusDetails: statusDetails
              };
            }
            return s;
          });
          
          // 从唤醒队列中移除已死亡的原小恶魔
          setWakeQueueIds(prev => prev.filter(id => id !== impSeat.id));
          
          // 检查游戏结束（不应该结束，因为新小恶魔还在）
          checkGameOver(updated);
          return updated;
        });
        
        // 记录原小恶魔的死亡
        setDeadThisNight(p => [...p, impSeat.id]);
        
        if (nightInfo) {
          addLogWithDeduplication(
            `${impSeat.id+1}号(小恶魔) 选择自己，身份转移给 ${newImp.id+1}号(${newImp.role?.name})，${impSeat.id+1}号已在夜晚死亡`,
            impSeat.id,
            '小恶魔'
          );
        }
      } else {
        // 如果没有活着的爪牙，小恶魔不能选择自己
        alert("场上没有活着的爪牙，无法转移身份");
        setShowKillConfirmModal(null);
        return;
      }
    } else {
      // 正常杀死其他玩家
      const target = seats.find(s => s.id === targetId);
      // 检查保护是否有效：如果被保护，必须检查保护者（僧侣）是否中毒/醉酒
      // 关键：中毒/醉酒状态下的僧侣的保护绝对无效
      let isEffectivelyProtected = false;
      if (target?.isProtected && target.protectedBy !== null) {
        const protector = seats.find(s => s.id === target.protectedBy);
        if (protector) {
          // 如果保护者中毒/醉酒，保护绝对无效，无论isProtected是否为true
          const isProtectorPoisoned = protector.isPoisoned || protector.isDrunk || protector.role?.id === "drunk";
          if (isProtectorPoisoned) {
            // 保护者中毒/醉酒，保护无效，同时清除错误的保护状态
            isEffectivelyProtected = false;
            setSeats(p => p.map(s => 
              s.id === targetId ? {...s, isProtected: false, protectedBy: null} : s
            ));
          } else {
            // 保护者健康，保护有效
            isEffectivelyProtected = true;
          }
        } else {
          // 保护者不存在，保护无效
          isEffectivelyProtected = false;
        }
      }
      if(target && !isEffectivelyProtected && target.role?.id !== 'soldier' && !target.isDead) {
        setSeats(p => {
          const updated = p.map(s => s.id === targetId ? { ...s, isDead: true } : s);
          // 从唤醒队列中移除已死亡的玩家
          setWakeQueueIds(prev => prev.filter(id => id !== targetId));
          // 检查游戏结束
          checkGameOver(updated);
          return updated;
        });
        setDeadThisNight(p => [...p, targetId]);
        if (nightInfo) {
          addLogWithDeduplication(
            `${nightInfo.seat.id+1}号(小恶魔) 杀害 ${targetId+1}号，${targetId+1}号已在夜晚死亡，跳过`,
            nightInfo.seat.id,
            '小恶魔'
          );
        }
      }
    }
    setShowKillConfirmModal(null);
    continueToNextAction();
  };
  
  // 确认下毒（善良玩家）
  const confirmPoison = () => {
    const targetId = showPoisonConfirmModal;
    if(!nightInfo || targetId === null) return;
    
    setSeats(p => p.map(s => ({...s, isPoisoned: s.id === targetId})));
    addLogWithDeduplication(
      `${nightInfo.seat.id+1}号(投毒者) 对 ${targetId+1}号 下毒`,
      nightInfo.seat.id,
      '投毒者'
    );
    setShowPoisonConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  };
  
  // 确认对邪恶玩家下毒（二次确认）
  const confirmPoisonEvil = () => {
    const targetId = showPoisonEvilConfirmModal;
    if(!nightInfo || targetId === null) return;
    
    setSeats(p => p.map(s => ({...s, isPoisoned: s.id === targetId})));
    addLogWithDeduplication(
      `${nightInfo.seat.id+1}号(投毒者) 对 ${targetId+1}号(队友) 下毒`,
      nightInfo.seat.id,
      '投毒者'
    );
    setShowPoisonEvilConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  };

  const executePlayer = (id: number) => {
    const t = seats.find(s => s.id === id);
    if (!t) return;
    
    // 10. 检查小恶魔是否被处决 - 立即结束游戏
    let newSeats = seats.map(s => s.id === id ? { ...s, isDead: true } : s);
    
    // 10. 立即检查小恶魔是否死亡
    if ((t.role?.type === 'demon' || t.isDemonSuccessor)) {
      setSeats(newSeats);
      addLog(`${id+1}号(小恶魔) 被处决`);
      setWinResult('good');
      setGamePhase('gameOver');
      addLog("游戏结束：小恶魔被处决，好人胜利");
      return;
    }
    
    if (t.role?.id === 'virgin' && !t.hasUsedVirginAbility && !t.isPoisoned) {
      const nominatorId = showVoteInputModal;
      if (nominatorId !== null) {
        const nominator = seats.find(s => s.id === nominatorId);
        if (nominator && nominator.role?.type === 'townsfolk') {
          setShowVirginTriggerModal({ source: nominator, target: t });
          return;
        }
      }
    }
    
    setSeats(newSeats);
    addLog(`${id+1}号 被处决`); 
    setExecutedPlayerId(id);
    // 10. 记录上一个黄昏的处决（用于送葬者）
    setLastDuskExecution(id);
    
    if(t?.role?.id === 'saint' && !t.isPoisoned) { 
      setWinResult('evil'); 
      setGamePhase('gameOver'); 
      addLog("游戏结束：圣徒被处决，邪恶胜利");
      return; 
    }
    
    if (checkGameOver(newSeats)) {
      return;
    }
    
    // 5. 屏蔽浏览器弹窗，直接进入夜晚
    setTimeout(() => { 
      startNight(false); 
    }, 500);
  };

  const handleDayAction = (id: number) => {
    if(!showDayActionModal) return;
    const {type, sourceId} = showDayActionModal; 
    setShowDayActionModal(null);
    if(type==='nominate') {
      // 8. 检查提名限制
      if (nominationRecords.nominators.has(sourceId)) {
        // 5. 屏蔽浏览器弹窗
        return;
      }
      if (nominationRecords.nominees.has(id)) {
        // 5. 屏蔽浏览器弹窗
        return;
      }
      // 更新提名记录
      setNominationRecords(prev => ({
        nominators: new Set(prev.nominators).add(sourceId),
        nominees: new Set(prev.nominees).add(id)
      }));
      addLog(`${sourceId+1}号 提名 ${id+1}号`); 
      setShowVoteInputModal(id);
    } else if(type==='slayer') {
      // 开枪可以在任意环节，但只有健康猎手选中恶魔才有效
      const shooter = seats.find(s => s.id === sourceId);
      if (!shooter || shooter.hasUsedSlayerAbility) return;
      
      const target = seats.find(s => s.id === id);
      if (!target) return;
      
      // 标记为已使用开枪能力
      setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
      
      // 只有健康状态的真正猎手选中恶魔才有效
      const isRealSlayer = shooter.role?.id === 'slayer' && !shooter.isPoisoned && !shooter.isDead;
      const isDemon = target.role?.type === 'demon' || target.isDemonSuccessor;
      
      if (isRealSlayer && isDemon) {
        // 恶魔死亡，游戏立即结束
        setSeats(p => {
          const newSeats = p.map(s => s.id === id ? { ...s, isDead: true } : s);
          addLog(`${sourceId+1}号(猎手) 开枪击杀 ${id+1}号(小恶魔)`);
          checkGameOver(newSeats);
          return newSeats;
        });
        // 显示弹窗：恶魔死亡
        setShowShootResultModal({ message: "恶魔死亡", isDemonDead: true });
      } else {
        addLog(`${sourceId+1}号${shooter.role?.id === 'slayer' ? '(猎手)' : ''} 开枪，但 ${id+1}号 不是恶魔或开枪者不是健康猎手`);
        // 显示弹窗：无事发生
        setShowShootResultModal({ message: "无事发生", isDemonDead: false });
      }
    }
  };

  const submitVotes = (v: number) => {
    if(showVoteInputModal===null) return;
    // 保存历史记录
    saveHistory();
    
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    // 票数达到50%才会上处决台
    setSeats(p=>p.map(s=>s.id===showVoteInputModal?{...s,voteCount:v,isCandidate:v>=threshold}:s));
    addLog(`${showVoteInputModal+1}号 获得 ${v} 票${v>=threshold ? ' (上台)' : ''}`);
    setShowVoteInputModal(null);
  };

  const executeJudgment = () => {
    // 保存历史记录
    saveHistory();
    
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) { 
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: "无人上台，无人被处决" });
      return; 
    }
    const max = cands[0].voteCount || 0;
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    
    // 只有票数最高的才会被处决（即使有多人上台）
    const tops = cands.filter(c => c.voteCount === max && (c.voteCount || 0) >= threshold);
    if(tops.length>1) { 
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: "平票，平安日，无人被处决" });
    } else if(tops.length === 1) {
      const executed = tops[0];
      executePlayer(executed.id);
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: `${executed.id+1}号被处决` });
    } else {
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: `最高票数 ${max} 未达到半数 ${threshold}，无人被处决` });
    }
  };
  
  // 6. 确认处决结果后继续游戏
  const confirmExecutionResult = () => {
    setShowExecutionResultModal(null);
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) {
      startNight(false);
      return;
    }
    const max = cands[0].voteCount || 0;
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    const tops = cands.filter(c => c.voteCount === max && (c.voteCount || 0) >= threshold);
    if(tops.length !== 1) {
      startNight(false);
    }
  };
  
  // 确认开枪结果后继续游戏
  const confirmShootResult = () => {
    setShowShootResultModal(null);
    // 如果恶魔死亡，游戏已经结束，不需要额外操作
    // 如果无事发生，继续游戏流程
  };

  const handleContextMenu = (e: React.MouseEvent, seatId: number) => { 
    e.preventDefault(); 
    setContextMenu({x:e.clientX,y:e.clientY,seatId}); 
  };

  const handleMenuAction = (action: string) => {
    if(!contextMenu) return;
    if(action==='nominate') { 
      // 只能在黄昏环节提名
      if (gamePhase !== 'dusk') {
        // 5. 屏蔽浏览器弹窗，使用控制台提示
        setContextMenu(null);
        return;
      }
      setShowDayActionModal({ type: 'nominate', sourceId: contextMenu.seatId });
    } else if(action==='slayer') {
      // 开枪可以在任意环节（除了setup阶段）
      const shooter = seats.find(s => s.id === contextMenu.seatId);
      if (!shooter || shooter.hasUsedSlayerAbility) {
        setContextMenu(null);
        return;
      }
      setShowDayActionModal({ type: 'slayer', sourceId: contextMenu.seatId });
    }
    setContextMenu(null);
  };

  const toggleStatus = (type: string) => {
    if(!contextMenu) return;
    setSeats(p => {
      const updated = p.map(s => s.id === contextMenu.seatId ? {
        ...s,
        isDead: type === 'dead' ? !s.isDead : s.isDead,
        isPoisoned: type === 'poison' ? !s.isPoisoned : s.isPoisoned,
        isDrunk: type === 'drunk' ? !s.isDrunk : s.isDrunk,
        isRedHerring: type === 'redherring' ? !s.isRedHerring : s.isRedHerring
      } : s);
      // 8. 恶魔可以死在任意环节，当被标记死亡后，游戏立即结束
      if (type === 'dead') {
        const target = updated.find(s => s.id === contextMenu.seatId);
        if (target && (target.role?.type === 'demon' || target.isDemonSuccessor) && target.isDead) {
          setWinResult('good');
          setGamePhase('gameOver');
          addLog(`游戏结束：${contextMenu.seatId+1}号(小恶魔) 被标记死亡，好人胜利`);
        }
      }
      return updated;
    });
    setContextMenu(null);
  };

  const confirmRavenkeeperFake = (r: Role) => {
    // 选择假身份后，弹出结果弹窗显示假身份
    const targetId = showRavenkeeperFakeModal;
    if (targetId !== null) {
      setShowRavenkeeperResultModal({
        targetId: targetId,
        roleName: r.name,
        isFake: true
      });
    }
    setShowRavenkeeperFakeModal(null);
  };

  const confirmRavenkeeperResult = () => {
    if (!showRavenkeeperResultModal || !nightInfo) return;
    
    const { targetId, roleName, isFake } = showRavenkeeperResultModal;
    const target = seats.find(s => s.id === targetId);
    
    // 记录日志
    if (isFake) {
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(守鸦人) 查验 ${targetId+1}号 -> 伪造: ${roleName}`,
        nightInfo.seat.id,
        '守鸦人'
      );
    } else {
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(守鸦人) 查验 ${targetId+1}号 -> ${roleName}`,
        nightInfo.seat.id,
        '守鸦人'
      );
    }
    
    // 关闭弹窗
    setShowRavenkeeperResultModal(null);
  };

  const confirmVirginTrigger = () => {
    if (!showVirginTriggerModal) return;
    const { source, target } = showVirginTriggerModal;
    if (target.role?.id === 'virgin' && !target.hasUsedVirginAbility && !target.isPoisoned) {
      setSeats(p => {
        const newSeats = p.map(s => 
          s.id === source.id ? { ...s, isDead: true } : 
          s.id === target.id ? { ...s, hasUsedVirginAbility: true } : s
        );
        addLog(`${source.id+1}号 提名贞洁者被处决`);
        checkGameOver(newSeats);
        return newSeats;
      });
      setShowVirginTriggerModal(null);
    } else {
      setShowVirginTriggerModal(null);
    }
  };

  const handleRestart = () => {
    if (confirm("确定重开?")) window.location.reload();
  };

  // 9. 保存历史记录 - 改为普通函数，使用ref避免Hook依赖问题
  const saveHistory = () => {
    const state = gameStateRef.current;
    setHistory(prev => [...prev, {
      seats: JSON.parse(JSON.stringify(state.seats)),
      gamePhase: state.gamePhase,
      nightCount: state.nightCount,
      executedPlayerId: state.executedPlayerId,
      wakeQueueIds: [...state.wakeQueueIds],
      currentWakeIndex: state.currentWakeIndex,
      selectedActionTargets: [...state.selectedActionTargets],
      gameLogs: [...state.gameLogs],
      currentHint: JSON.parse(JSON.stringify(currentHint)) // 保存当前 hint
    }]);
  };

  // 9.1 控制面板的"上一步"：只退回流程，不改变已生成的信息
  // 支持无限次后退，直到当前夜晚/阶段的开始
  const handleStepBack = () => {
    if (currentWakeIndex > 0) {
      setCurrentWakeIndex(currentWakeIndex - 1);
      // hint 会从缓存中恢复，不重新生成
    }
    // 如果已经是第一个，但还有历史记录，可以继续后退到上一个阶段
    else if (history.length > 0) {
      const lastState = history[history.length - 1];
      // 如果上一个状态是夜晚阶段，恢复并设置到最后一个唤醒索引
      if (lastState.gamePhase === gamePhase && lastState.wakeQueueIds.length > 0) {
        setSeats(lastState.seats);
        setGamePhase(lastState.gamePhase);
        setNightCount(lastState.nightCount);
        setExecutedPlayerId(lastState.executedPlayerId);
        setWakeQueueIds(lastState.wakeQueueIds);
        setCurrentWakeIndex(Math.max(0, lastState.wakeQueueIds.length - 1));
        setSelectedActionTargets(lastState.selectedActionTargets);
        setGameLogs(lastState.gameLogs);
        setHistory(prev => prev.slice(0, -1));
      }
    }
  };
  
  // 9.2 全局上一步：撤销当前动作，清除缓存，重新生成信息
  // 支持无限次撤回，直到游戏开始（setup阶段）
  const handleGlobalUndo = () => {
    if (history.length === 0) {
      // 如果历史记录为空，但不在setup阶段，可以尝试回到setup阶段
      if (gamePhase !== 'setup') {
        // 重置到游戏开始状态
        setGamePhase('setup');
        setNightCount(1);
        setExecutedPlayerId(null);
        setWakeQueueIds([]);
        setCurrentWakeIndex(0);
        setSelectedActionTargets([]);
        setGameLogs([]);
        hintCacheRef.current.clear();
        // 恢复初始座位（如果有保存的话）
        if (initialSeats.length > 0) {
          setSeats(JSON.parse(JSON.stringify(initialSeats)));
        }
        return;
      }
      alert("已经回到游戏开始状态，无法继续撤回");
      return;
    }
    const lastState = history[history.length - 1];
    setSeats(lastState.seats);
    setGamePhase(lastState.gamePhase);
    setNightCount(lastState.nightCount);
    setExecutedPlayerId(lastState.executedPlayerId);
    setWakeQueueIds(lastState.wakeQueueIds);
    setCurrentWakeIndex(lastState.currentWakeIndex);
    setSelectedActionTargets(lastState.selectedActionTargets);
    setGameLogs(lastState.gameLogs);
    
    // 清除 hint 缓存，让信息重新生成（符合"全局上一步"的需求）
    hintCacheRef.current.clear();
    
    // 不恢复 hint，让 useEffect 重新计算（这样信息会重新生成）
    
    setHistory(prev => prev.slice(0, -1));
  };

  // --- Render ---
  return (
    <div 
      className={`flex h-screen text-white overflow-hidden relative ${
        gamePhase==='day'?'bg-sky-900':
        gamePhase==='dusk'?'bg-stone-900':
        'bg-gray-950'
      }`} 
      onClick={()=>{setContextMenu(null);setShowMenu(false);}}
    >
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        <button 
          onClick={()=>{if(gamePhase==='gameOver')setShowReviewModal(true)}} 
          className="p-3 bg-indigo-600 border rounded-lg shadow-lg"
        >
          复盘
        </button>
        <button 
          onClick={(e)=>{e.stopPropagation();setShowMenu(!showMenu)}} 
          className="p-3 bg-gray-800 border rounded-lg shadow-lg"
        >
          ☰
        </button>
        {showMenu && (
          <div className="absolute right-0 mt-14 w-48 bg-gray-800 border rounded-lg shadow-xl z-[1000]">
            <button 
              onClick={handleRestart} 
              className="w-full p-4 text-left text-red-400 hover:bg-gray-700"
            >
              🔄 重开
            </button>
          </div>
        )}
      </div>
      
      <div className="w-3/5 relative flex items-center justify-center border-r border-gray-700">
        {/* 2. 万能上一步按钮 - 移到左侧圆桌右上角 */}
        {/* 支持无限次撤回，直到游戏开始（setup阶段） */}
        {(history.length > 0 || gamePhase !== 'setup') && (
          <button
            onClick={handleGlobalUndo}
            className="absolute top-4 right-4 z-50 px-4 py-2 bg-blue-600 rounded-xl font-bold text-sm shadow-lg hover:bg-blue-700 transition-colors"
          >
            <div className="flex flex-col items-center">
              <div>⬅️ 万能上一步</div>
              <div className="text-xs font-normal opacity-80">（撤销当前动作）</div>
            </div>
          </button>
        )}
        {nightInfo && (
          <div className="absolute top-4 left-4 text-sm font-bold text-blue-300 bg-black/50 px-4 py-2 rounded-xl shadow-lg border border-blue-500 z-50">
            当前{nightInfo.seat.id+1}号{nightInfo.effectiveRole.name}行动
          </div>
        )}
        <div className="absolute pointer-events-none text-center z-0 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="text-6xl font-bold opacity-50 mb-4">{phaseNames[gamePhase]}</div>
          {gamePhase!=='setup' && (
            <div className="text-5xl font-mono text-yellow-300">{formatTimer(timer)}</div>
          )}
        </div>
        <div className="relative w-[70vmin] h-[70vmin]">
              {seats.map((s,i)=>{
            const p=getSeatPosition(i, seats.length);
            const colorClass = s.role ? typeColors[s.role.type] : 'border-gray-600 text-gray-400';
            return (
              <div 
                key={s.id} 
                onClick={(e)=>{e.stopPropagation();handleSeatClick(s.id)}} 
                onContextMenu={(e)=>handleContextMenu(e,s.id)}
                  style={{left:`${p.x}%`,top:`${p.y}%`,transform:'translate(-50%,-50%)'}} 
                className={`absolute w-24 h-24 rounded-full border-4 flex items-center justify-center cursor-pointer z-30 bg-gray-900 transition-all duration-300
                  ${colorClass} 
                  ${nightInfo?.seat.id===s.id?'ring-4 ring-yellow-400 scale-110 shadow-[0_0_30px_yellow]':''} 
                  ${s.isDead?'grayscale opacity-60':''} 
                  ${selectedActionTargets.includes(s.id)?'ring-4 ring-green-500 scale-105':''}
                `}
              >
                {/* 座位号 - 左上角 */}
                <div className="absolute -top-5 -left-5 w-9 h-9 bg-gray-800 rounded-full border-2 border-gray-600 flex items-center justify-center text-base font-bold z-40">
                  {s.id+1}
                  </div>
                
                {/* 角色名称 */}
                <span className="text-sm font-bold text-center leading-tight px-1">
                  {s.role?.id==='drunk'?`${s.charadeRole?.name || s.role?.name}\n(酒)`:
                   s.isDemonSuccessor && s.role?.id === 'imp'?`${s.role?.name}\n(传)`:
                   s.role?.name||"空"}
                </span>
                
                {/* 状态图标 - 底部 */}
                <div className="absolute -bottom-3 flex gap-1">
                  {s.isPoisoned&&<span className="text-lg">🧪</span>}
                  {s.isProtected&&<span className="text-lg">🛡️</span>}
                  {s.isRedHerring&&<span className="text-lg">😈</span>}
                </div>
                
                {/* 右上角提示区域 */}
                <div className="absolute -top-5 -right-5 flex flex-col gap-1 items-end z-40">
                  {/* 主人标签 */}
                  {seats.some(seat => seat.masterId === s.id) && (
                    <span className="text-xs bg-purple-600 px-2 py-0.5 rounded-full shadow font-bold">
                      主人
                    </span>
                  )}
                  {/* 处决台标签 */}
                  {s.isCandidate && (
                    <span className="text-xs bg-red-600 px-2 py-0.5 rounded-full shadow font-bold animate-pulse">
                      ⚖️{s.voteCount}
                    </span>
                  )}
                </div>
              </div>
            );
              })}
          </div>
      </div>

      <div className="w-2/5 flex flex-col border-l border-gray-800 bg-gray-900/95 z-40">
        <div className="p-3 border-b font-bold text-purple-400 text-lg">控制台</div>
          <div className="flex-1 overflow-y-auto p-3 text-sm">
          {/* 4. 白天控制台增加说书人提示 */}
          {gamePhase==='day' && (
            <div className="mb-3 p-2 bg-gray-800/50 border border-yellow-500/30 rounded-lg text-xs text-gray-300 leading-relaxed">
              <p className="mb-1 font-bold text-yellow-400 text-xs">📖 说书人提示</p>
              <p className="mb-1 text-[10px]">你的目标是主持一场有趣好玩且参与度高的游戏。</p>
              <p className="mb-1 text-[10px]">有些事你可以做，但不意味着你应该去做。你是否只顾自己取乐而给玩家们添乱？你是否正在牺牲玩家的乐趣来放纵自己？比如说当小恶魔在夜里将自己杀死时，你"可以"将陌客当作是爪牙并让他因此变成一个善良的小恶魔，但这并不意味着这样做是有趣或平衡的。比如说你"可以"说服一名迷惑的善良阵营玩家，告诉他他是邪恶阵营的，但这并不意味着玩家在得知真相后会享受这个过程。又比如说你"可以"给博学者提供完全没用的信息，但显然提供有趣且独特的信息会更好。</p>
              <p className="mb-1 text-[10px]">作为说书人，你在每一局游戏当中都需要做出很多有趣的决定。而这每一个决定的目的都应该是使游戏变得更好玩，为大家带来更多乐趣。这通常意味着你需要给善良阵营制造尽可能多的混乱，将他们引入歧途，因为这对所有人来说都是有趣的。但请牢记在心，维持游戏的公平性是同样重要的，你主持游戏是为了让玩家都能够享受到游戏中的精彩。</p>
                      </div>
          )}
          {gamePhase==='setup' && (
            <div className="space-y-4">
              {Object.entries(groupedRoles).map(([type, list]) => (
                <div key={type}>
                  <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{typeLabels[type] || type}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {list.map(r=>{
                      const isTaken=seats.some(s=>s.role?.id===r.id);
                      return (
                        <button 
                          key={r.id} 
                          onClick={(e)=>{e.stopPropagation();if(!isTaken)setSelectedRole(r)}} 
                          className={`p-2 border rounded-lg text-xs font-medium transition-all ${
                            isTaken?'opacity-30 cursor-not-allowed bg-gray-800':'' 
                          } ${typeBgColors[r.type]} ${
                            selectedRole?.id===r.id?'ring-2 ring-white scale-105':''
                          }`}
                        >
                          {r.name}
                        </button>
                      );
                    })}
                      </div>
                      </div>
              ))}
                  </div>
              )}
          
          {gamePhase==='check' && (
            <div className="text-center">
              <h2 className="text-xl font-bold mb-3">核对身份</h2>
              <div className="bg-gray-800 p-3 rounded-xl text-left text-sm space-y-2 max-h-[60vh] overflow-y-auto">
                {seats.filter(s=>s.role).map(s=>(
                  <div key={s.id} className="flex justify-between border-b border-gray-700 pb-2">
                    <span>{s.id+1}号</span>
                    <span className={s.role?.type==='demon'?'text-red-500 font-bold':''}>
                      {s.role?.name} 
                      {s.role?.id==='drunk' && `(伪:${s.charadeRole?.name})`} 
                      {s.isRedHerring && '[红罗刹]'}
                    </span>
          </div>
                ))}
          </div>
      </div>
          )}
          
          {(gamePhase==='firstNight'||gamePhase==='night') && nightInfo ? (
            <div className="space-y-3 animate-fade-in">
              <div className="text-center mb-2">
                <h2 className={`text-2xl font-bold ${typeColors[nightInfo.effectiveRole.type].split(' ')[0]}`}>
                  {nightInfo.effectiveRole.name}
                </h2>
                <p className="text-gray-400 mt-1 text-sm">{nightInfo.seat.id+1}号</p>
              </div>
              <div className={`p-3 rounded-xl border-2 ${
                currentHint.isPoisoned?'bg-red-900/20 border-red-500':'bg-gray-800 border-gray-600'
              }`}>
                {currentHint.isPoisoned && (
                  <div className="text-red-400 font-bold mb-2 text-sm flex items-center gap-2">
                    ⚠️ {currentHint.reason}
                  </div>
                )}
                <div className="mb-1 text-xs text-gray-400 font-bold uppercase">📖 指引：</div>
                <p className="text-sm mb-3 leading-relaxed whitespace-pre-wrap font-medium">{currentHint.guide}</p>
                <div className="mb-1 text-xs text-yellow-400 font-bold uppercase">🗣️ 台词：</div>
                <p className="text-base font-serif bg-black/40 p-2 rounded-xl border-l-2 border-yellow-500 italic text-yellow-100">
                  {currentHint.speak}
                </p>
              </div>
                      
              {nightInfo.effectiveRole.nightActionType === 'spy_info' && (
                <div className="bg-black/50 p-2 rounded-xl h-40 overflow-y-auto text-[10px] flex gap-2">
                  <div className="w-1/2">
                    <h4 className="text-purple-400 mb-1 font-bold border-b pb-0.5 text-xs">魔典</h4>
                    {seats.filter(s=>s.role).map(s => (
                      <div key={s.id} className="py-0.5 border-b border-gray-700 flex justify-between">
                        <span>{s.id+1}号</span>
                        <span className={s.role?.type==='demon'?'text-red-500':''}>
                          {s.role?.name}
                        </span>
    </div>
                    ))}
                  </div>
                  <div className="w-1/2">
                    <h4 className="text-yellow-400 mb-1 font-bold border-b pb-0.5 text-xs">行动日志</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {/* 5. 按天数分开显示日志 */}
                      {(() => {
                        const logsByDay = gameLogs.reduce((acc, log) => {
                          const dayKey = log.day;
                          if (!acc[dayKey]) acc[dayKey] = [];
                          acc[dayKey].push(log);
                          return acc;
                        }, {} as Record<number, LogEntry[]>);
                        
                        return Object.entries(logsByDay).reverse().map(([day, logs]) => (
                          <div key={day} className="mb-1">
                            <div className="text-yellow-300 font-bold mb-0.5 text-[10px]">
                              {logs[0]?.phase === 'firstNight' ? '第1夜' : 
                               logs[0]?.phase === 'night' ? `第${day}夜` :
                               logs[0]?.phase === 'day' ? `第${day}天` :
                               logs[0]?.phase === 'dusk' ? `第${day}天黄昏` : `第${day}轮`}
                            </div>
                            {logs.reverse().map((l, i) => (
                              <div key={i} className="py-0.5 border-b border-gray-700 text-gray-300 text-[10px] pl-1">
                                {l.message}
                              </div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}
              
              {/* 7. 修复小恶魔选择问题 - 确保小恶魔在非首夜可以显示选择按钮 */}
              {nightInfo.effectiveRole.nightActionType!=='spy_info' && nightInfo.effectiveRole.nightActionType!=='none' && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {seats.filter(s=>{
                    // 占卜师可以选择任意2名玩家（包括自己和已死亡玩家）
                    if (nightInfo.effectiveRole.id === 'fortune_teller') {
                      return s.role !== null; // 只要有角色就可以选择
                    }
                    // 小恶魔在非首夜可以选择任意活着的玩家
                    if (nightInfo.effectiveRole.id === 'imp' && gamePhase !== 'firstNight') {
                      return s.role && !s.isDead;
                    }
                    // 其他角色根据规则过滤
                    return s.role && (nightInfo.effectiveRole.id==='ravenkeeper' || !s.isDead);
                  }).map(s=>(
                    <button 
                      key={s.id} 
                      onClick={()=>toggleTarget(s.id)} 
                      disabled={isTargetDisabled(s)} 
                      className={`p-2 border-2 rounded-lg text-xs font-bold transition-all ${
                        selectedActionTargets.includes(s.id)?
                          'bg-green-600 border-white scale-105 shadow-lg ring-2 ring-green-500':
                          'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      } ${isTargetDisabled(s)?'opacity-30 cursor-not-allowed':''}`}
                    >
                      [{s.id+1}] {s.role?.name}
                    </button>
                  ))}
                </div>
              )}
              
              {inspectionResult && (
                <div className="bg-blue-600 p-2 rounded-xl text-center font-bold text-lg shadow-2xl mt-2 animate-bounce">
                  {inspectionResult}
                </div>
              )}
            </div>
          ) : ((gamePhase==='firstNight'||gamePhase==='night') && (
            <div className="text-center text-gray-500 mt-20 text-xl">正在计算行动...</div>
          ))}
          
          {gamePhase==='dusk' && (
            <div className="mt-2 bg-gray-800 p-2 rounded-xl">
              <h3 className="text-sm font-bold mb-1 text-orange-400">⚖️ 处决台</h3>
              {seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0)).map((s,i)=>(
                <div 
                  key={s.id} 
                  className={`flex justify-between p-2 border-b border-gray-600 ${
                    i===0?'text-red-400 font-bold':''
                  }`}
                >
                  <span>{s.id+1}号 {s.role?.name}</span>
                  <span>{s.voteCount}票</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-3 border-t border-gray-700 bg-gray-900 flex gap-2 justify-center z-50">
          {gamePhase==='setup' && (
            <button 
              onClick={handlePreStartNight} 
              className="w-full py-2 bg-indigo-600 rounded-xl font-bold text-sm shadow-xl"
            >
              开始游戏 (首夜)
            </button>
          )}
          {gamePhase==='check' && (
            <button 
              onClick={()=>startNight(true)} 
              className="w-full py-2 bg-green-600 rounded-xl font-bold text-sm shadow-xl"
            >
              确认无误，入夜
            </button>
          )}
          {(gamePhase==='firstNight'||gamePhase==='night') && (
            <>
              <button 
                onClick={handleStepBack} 
                className="flex-1 py-2 bg-gray-700 rounded-xl font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentWakeIndex === 0 && history.length === 0}
              >
                上一步
              </button>
              <button 
                onClick={handleConfirmAction} 
                disabled={
                  // 3. 占卜师必须选择2名玩家才能确认
                  (nightInfo?.effectiveRole.id === 'fortune_teller' && selectedActionTargets.length !== 2) ||
                  // 恶魔在非首夜必须选择1名玩家才能确认，首夜不需要选择
                  (nightInfo?.effectiveRole.id === 'imp' && 
                   gamePhase !== 'firstNight' && 
                   nightInfo?.effectiveRole.nightActionType !== 'none' && 
                   selectedActionTargets.length !== 1) ||
                  // 投毒者必须选择1名玩家才能确认
                  (nightInfo?.effectiveRole.id === 'poisoner' && 
                   nightInfo?.effectiveRole.nightActionType !== 'none' && 
                   selectedActionTargets.length !== 1) ||
                  // 守鸦人必须选择1名玩家并确认结果后才能继续（仅当守鸦人死亡时）
                  (nightInfo?.effectiveRole.id === 'ravenkeeper' && 
                   nightInfo?.effectiveRole.nightActionType === 'inspect_death' && 
                   nightInfo?.seat.isDead &&
                   (selectedActionTargets.length !== 1 || showRavenkeeperResultModal !== null || showRavenkeeperFakeModal !== null))
                }
                className="flex-[2] py-2 bg-white text-black rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认 / 下一步
              </button>
            </>
          )}
          {gamePhase==='day' && (
            <button 
              onClick={()=>{
                // 保存历史记录
                saveHistory();
                setGamePhase('dusk');
                // 重置所有提名状态，允许重新提名
                setSeats(p => p.map(s => ({...s, voteCount: undefined, isCandidate: false})));
                // 重置提名记录
                setNominationRecords({ nominators: new Set(), nominees: new Set() });
              }} 
              className="w-full py-2 bg-orange-600 rounded-xl font-bold text-sm"
            >
              进入黄昏 (提名)
            </button>
          )}
          {gamePhase==='dusk' && (
            <>
              <button 
                onClick={executeJudgment} 
                className="flex-[2] py-2 bg-red-600 rounded-xl font-bold text-sm shadow-lg animate-pulse"
              >
                执行处决
              </button>
              <button 
                onClick={()=>startNight(false)} 
                className="flex-1 py-2 bg-indigo-600 rounded-xl font-bold text-xs"
              >
                直接入夜
              </button>
            </>
          )}
          {gamePhase==='dawnReport' && (
            <button 
              onClick={()=>setGamePhase('day')} 
              className="w-full py-2 bg-yellow-500 text-black rounded-xl font-bold text-sm"
            >
              进入白天
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {showDrunkModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[800px] border-2 border-yellow-500">
            <h2 className="mb-6 text-center text-3xl text-yellow-400">🍺 请为酒鬼选择伪装 (互斥)</h2>
            <div className="grid grid-cols-4 gap-4">
              {groupedRoles['townsfolk'].map(r=>{
                const isTaken=seats.some(s=>s.role?.id===r.id);
                return (
                  <button 
                    key={r.id} 
                    onClick={()=>!isTaken && confirmDrunkCharade(r)} 
                    disabled={isTaken} 
                    className={`p-4 border-2 rounded-xl text-lg font-bold ${
                      isTaken?'opacity-20 cursor-not-allowed border-gray-700':'border-blue-500 hover:bg-blue-900'
                    }`}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {showVoteInputModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500">
            <h3 className="text-3xl font-bold mb-6">🗳️ 输入票数</h3>
            <input 
              autoFocus 
              type="number" 
              className="w-full p-4 bg-gray-700 rounded-xl mb-6 text-center text-4xl font-mono" 
              onKeyDown={(e)=>{if(e.key==='Enter')submitVotes(parseInt(e.currentTarget.value)||0)}} 
            />
            <button 
              onClick={(e:any)=>submitVotes(parseInt(e.target.previousSibling.value)||0)} 
              className="w-full py-4 bg-indigo-600 rounded-xl text-2xl font-bold"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {showDayActionModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[500px] text-center">
            <h2 className="mb-6 text-3xl font-bold text-red-400">
              {showDayActionModal.type==='slayer'?'💥 开枪':'🗣️ 提名'}
            </h2>
            <div className="flex flex-wrap gap-3 justify-center">
              {seats.filter(s=>!s.isDead).map(s=>{
                // 8. 提名限制：检查是否已被提名或被提名过
                const isDisabled = showDayActionModal?.type === 'nominate' && (
                  nominationRecords.nominees.has(s.id) || 
                  nominationRecords.nominators.has(showDayActionModal.sourceId)
                );
                return (
                  <button 
                    key={s.id} 
                    onClick={()=>{
                      if (!isDisabled) {
                        handleDayAction(s.id);
                        setShowDayActionModal(null);
                        setShowShootModal(null);
                        setShowNominateModal(null);
                      }
                    }} 
                    disabled={isDisabled}
                    className={`p-4 border-2 rounded-xl text-xl font-bold transition-all ${
                      isDisabled ? 'opacity-30 cursor-not-allowed bg-gray-700' : 
                      'hover:bg-gray-700'
                    }`}
                  >
                    {s.id+1}号 {s.role?.name}
                  </button>
                );
              })}
            </div>
            <button 
              onClick={()=>{
                setShowDayActionModal(null);
                setShowShootModal(null);
                setShowNominateModal(null);
              }} 
              className="mt-8 w-full py-3 bg-gray-600 rounded-xl text-xl"
            >
              取消
            </button>
          </div>
        </div>
      )}
      
      {showVirginTriggerModal && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-indigo-900 p-10 rounded-2xl text-center border-4 border-white">
            <h2 className="text-4xl font-bold text-yellow-300 mb-6">✨ 贞洁者触发！</h2>
            <div className="flex gap-6 justify-center">
              <button 
                onClick={()=>setShowVirginTriggerModal(null)} 
                className="px-6 py-4 bg-gray-600 rounded-xl text-xl"
              >
                取消
              </button>
              <button 
                onClick={confirmVirginTrigger} 
                className="px-6 py-4 bg-red-600 rounded-xl text-xl font-bold"
              >
                处决提名者
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showRavenkeeperFakeModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[600px] border-2 border-purple-500">
            <h2 className="text-2xl font-bold mb-6 text-center">🧛 (中毒) 编造结果</h2>
            <div className="grid grid-cols-3 gap-3">
              {roles.map(r=>(
                <button 
                  key={r.id} 
                  onClick={()=>confirmRavenkeeperFake(r)} 
                  className="p-3 border rounded-lg text-sm font-medium hover:bg-purple-900"
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {showRavenkeeperResultModal && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[600px] border-2 border-blue-500 text-center">
            <h2 className="text-3xl font-bold mb-6 text-blue-400">🧛 守鸦人查验结果</h2>
            <p className="text-2xl font-bold text-white mb-8">
              {showRavenkeeperResultModal.targetId+1}号玩家的真实身份是{showRavenkeeperResultModal.roleName}
              {showRavenkeeperResultModal.isFake && <span className="text-red-400 text-xl block mt-2">(中毒/醉酒状态，此为假消息)</span>}
            </p>
            <button
              onClick={confirmRavenkeeperResult}
              className="px-12 py-4 bg-blue-600 rounded-xl font-bold text-2xl hover:bg-blue-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {gamePhase==="dawnReport" && (
        <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
          <div className="bg-gray-800 p-12 rounded-3xl text-center border-4 border-yellow-500 min-w-[500px]">
            <h2 className="text-6xl mb-8">🌅 天亮了！</h2>
            <p className="text-3xl text-gray-300 mb-10">
              昨晚死亡：<span className="text-red-500 font-bold">
                {deadThisNight.length>0 ? deadThisNight.map(id => `${id+1}号`).join('、') : "平安夜"}
              </span>
            </p>
            <button 
              onClick={()=>setGamePhase('day')} 
              className="px-12 py-5 bg-yellow-500 text-black font-bold rounded-full text-3xl"
            >
              开始白天
            </button>
          </div>
        </div>
      )}
      
      {gamePhase==="gameOver" && (
        <div className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center">
          <div className="text-center">
            <h1 className={`text-8xl font-bold mb-10 ${
              winResult==='good'?'text-blue-500':'text-red-500'
            }`}>
              {winResult==='good'?'🏆 好人胜利':'👿 邪恶胜利'}
            </h1>
            <button 
              onClick={()=>setShowReviewModal(true)} 
              className="px-10 py-5 bg-white text-black rounded-full text-3xl font-bold"
            >
              查看复盘
            </button>
          </div>
        </div>
      )}
      
      {showReviewModal && (
        <div className="fixed inset-0 z-[5000] bg-black/95 flex flex-col p-10 overflow-auto">
          <h2 className="text-4xl mb-6">📜 对局复盘</h2>
          <div className="grid grid-cols-2 gap-8">
            <div className="bg-gray-900 p-6 rounded">
              <h3 className="text-xl font-bold mb-4">初始配置</h3>
              {initialSeats.map(s=>(
                <div key={s.id} className="mb-2">
                  {s.id+1}号: {s.role?.name} 
                  {s.role?.id==='drunk'&&`(伪:${s.charadeRole?.name})`}
                  {s.isRedHerring && '[红罗刹]'}
                </div>
              ))}
            </div>
            <div className="bg-gray-900 p-6 rounded">
              <h3 className="text-xl font-bold mb-4">行动日志</h3>
              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {gameLogs.map((l,i)=>(
                  <div key={i} className="text-sm border-b border-gray-700 pb-1">
                    [{l.phase}] {l.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button 
            onClick={()=>window.location.reload()} 
            className="mt-8 px-8 py-4 bg-red-600 rounded text-2xl self-center"
          >
            彻底重开
          </button>
        </div>
      )}

      {contextMenu && (
        <div 
          className="absolute bg-gray-800 border-2 border-gray-500 rounded-xl shadow-2xl z-[3000] w-48 overflow-hidden" 
          style={{top:contextMenu.y,left:contextMenu.x}}
        >
          {gamePhase==='dusk' && !seats[contextMenu.seatId].isDead && (
            <button 
              onClick={()=>handleMenuAction('nominate')} 
              disabled={nominationRecords.nominators.has(contextMenu.seatId)}
              className={`block w-full text-left px-6 py-4 hover:bg-purple-900 text-purple-300 font-bold text-lg border-b border-gray-600 ${
                nominationRecords.nominators.has(contextMenu.seatId) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              🗣️ 提名
            </button>
          )}
          {/* 开枪可以在任意环节（除了setup阶段） */}
          {!seats[contextMenu.seatId].isDead && gamePhase !== 'setup' && (
            <button 
              onClick={()=>handleMenuAction('slayer')} 
              disabled={seats[contextMenu.seatId].hasUsedSlayerAbility}
              className={`block w-full text-left px-6 py-4 hover:bg-red-900 text-red-300 font-bold text-lg border-b border-gray-600 ${
                seats[contextMenu.seatId].hasUsedSlayerAbility ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              💥 开枪
            </button>
          )}
          <button 
            onClick={()=>toggleStatus('dead')} 
            className="block w-full text-left px-6 py-3 hover:bg-gray-700 text-lg font-medium"
          >
            💀 切换死亡
          </button>
        </div>
      )}
      
      
      {/* 6. 处决结果弹窗 */}
      {showExecutionResultModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-red-500 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-4xl font-bold text-red-400 mb-6">⚖️ 处决结果</h2>
            <p className="text-3xl font-bold text-white mb-8">{showExecutionResultModal.message}</p>
            <button
              onClick={confirmExecutionResult}
              className="px-12 py-4 bg-green-600 rounded-xl font-bold text-2xl hover:bg-green-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {/* 开枪结果弹窗 */}
      {showShootResultModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className={`bg-gray-800 border-4 ${showShootResultModal.isDemonDead ? 'border-red-500' : 'border-yellow-500'} rounded-2xl p-8 max-w-md text-center`}>
            <h2 className={`text-4xl font-bold mb-6 ${showShootResultModal.isDemonDead ? 'text-red-400' : 'text-yellow-400'}`}>
              {showShootResultModal.isDemonDead ? '💥 恶魔死亡' : '💥 开枪结果'}
            </h2>
            <p className="text-3xl font-bold text-white mb-8">{showShootResultModal.message}</p>
            <button
              onClick={confirmShootResult}
              className="px-12 py-4 bg-green-600 rounded-xl font-bold text-2xl hover:bg-green-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {/* 恶魔确认杀死玩家弹窗 */}
      {showKillConfirmModal !== null && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-red-500 rounded-2xl p-8 max-w-md text-center">
            {nightInfo && nightInfo.effectiveRole.id === 'imp' && showKillConfirmModal === nightInfo.seat.id ? (
              <>
                <h2 className="text-4xl font-bold text-red-400 mb-6">👑 确认转移身份</h2>
                <p className="text-3xl font-bold text-white mb-4">确认选择自己吗？</p>
                <p className="text-xl text-yellow-400 mb-8">身份将转移给场上的一个爪牙，你将在夜晚死亡</p>
              </>
            ) : (
              <>
                <h2 className="text-4xl font-bold text-red-400 mb-6">💀 确认杀死玩家</h2>
                <p className="text-3xl font-bold text-white mb-8">确认杀死{showKillConfirmModal+1}号玩家吗？</p>
              </>
            )}
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  setShowKillConfirmModal(null);
                  setSelectedActionTargets([]);
                }}
                className="px-8 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmKill}
                className="px-8 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-700 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 投毒者确认下毒弹窗（善良玩家） */}
      {showPoisonConfirmModal !== null && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-purple-500 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-4xl font-bold text-purple-400 mb-6">🧪 确认下毒</h2>
            <p className="text-3xl font-bold text-white mb-8">确认对{showPoisonConfirmModal+1}号玩家下毒吗？</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  setShowPoisonConfirmModal(null);
                  setSelectedActionTargets([]);
                }}
                className="px-8 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmPoison}
                className="px-8 py-4 bg-purple-600 rounded-xl font-bold text-xl hover:bg-purple-700 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 投毒者确认对邪恶玩家下毒弹窗（二次确认） */}
      {showPoisonEvilConfirmModal !== null && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-red-500 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-4xl font-bold text-red-400 mb-6">⚠️ 警告</h2>
            <p className="text-3xl font-bold text-white mb-4">该玩家是邪恶阵营</p>
            <p className="text-2xl font-bold text-yellow-400 mb-8">确认对{showPoisonEvilConfirmModal+1}号玩家下毒吗？</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  setShowPoisonEvilConfirmModal(null);
                  setSelectedActionTargets([]);
                }}
                className="px-8 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmPoisonEvil}
                className="px-8 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-700 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 夜晚死亡报告弹窗 */}
      {showNightDeathReportModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-blue-500 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-4xl font-bold text-blue-400 mb-6">🌙 夜晚报告</h2>
            <p className="text-3xl font-bold text-white mb-8">{showNightDeathReportModal}</p>
            <button
              onClick={confirmNightDeathReport}
              className="px-12 py-4 bg-green-600 rounded-xl font-bold text-2xl hover:bg-green-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
