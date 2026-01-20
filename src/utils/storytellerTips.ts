import type { GamePhase, Seat } from "@/app/data";

type TipPhase = GamePhase | "any";

interface TipContext {
  gamePhase: GamePhase;
  seats: Seat[];
  nightCount: number;
  deadThisNight?: number[];
  /**
   * 传入控制器的 isGoodAlignment，若缺省则按角色类型推断善恶
   */
  isGoodAlignment?: (seat: Seat) => boolean;
}

interface TipDefinition {
  id: string;
  text: string;
  phases: TipPhase[];
  when?: (ctx: TipContext & DerivedContext) => boolean;
}

interface DerivedContext {
  aliveCore: Seat[];
  aliveGood: Seat[];
  aliveEvil: Seat[];
}

/**
 * 基础提示清单：按阶段挑选，再配合动态提示一起输出
 */
const BASE_TIPS: TipDefinition[] = [
  {
    id: "finger-confirm",
    phases: ["night", "firstNight"],
    text: "夜晚选人指向含糊时，走到目标旁竖直指向头顶，双方点头确认，避免误会。",
  },
  {
    id: "night-walk-random",
    phases: ["night", "firstNight"],
    text: "夜晚刻意多走动、不要只去固定角落，让脚步声难以被猜出是谁被叫醒。",
  },
  {
    id: "move-reminder-tokens",
    phases: ["night", "firstNight"],
    text: "无论是真角色还是伪装者，使用完能力都在魔典中移动对应提示标记，避免被老玩家看出端倪。",
  },
  {
    id: "silent-tap",
    phases: ["night", "firstNight"],
    text: "叫醒玩家时轻拍肩膀或膝盖，不要发声；厚衣服感知弱时改为两次按压。",
  },
  {
    id: "show-ability-text",
    phases: ["night", "firstNight"],
    text: "玩家醒来不知道做什么？指向其角色列表上的能力描述即可，无需多言。",
  },
  {
    id: "grimoire-horizontal",
    phases: ["night", "firstNight"],
    text: "走动时保持魔典水平，从书脊上方或下方握持，防止被偷看或折断。",
  },
  {
    id: "stand-in-circle",
    phases: ["day", "dusk"],
    text: "宣布投票、倒数等重要事项时站在玩家圆圈中央，确保所有人能看见听见。",
  },
  {
    id: "mistake-keep-running",
    phases: ["any"],
    text: "如果犯错，直接说明“我出错了”并继续主持，不要用补偿去平衡，保持节奏。",
  },
  {
    id: "answer-privately",
    phases: ["day", "dusk"],
    text: "角色相关问题尽量私下回答；公开回答时用玩家姓名而非角色名，避免暴露身份。",
  },
  {
    id: "no-pre-night-claims",
    phases: ["setup", "check"],
    text: "首夜前阻止集体爆身份，必要时直接说明或加入地狱藏书员来限制。",
  },
  {
    id: "night-silence",
    phases: ["night", "firstNight"],
    text: "夜晚使用能力时提醒保持沉默，避免每个人都口述行动让邪恶方难以伪装。",
  },
  {
    id: "stay-in-circle",
    phases: ["day"],
    text: "鼓励玩家主要待在座位圈，方便随时提名并促进新老玩家交流。",
  },
  {
    id: "cross-circle-chat",
    phases: ["day"],
    text: "主动鼓励玩家起身与对侧的玩家私聊，让双方阵营都能开展策略。",
  },
  {
    id: "travelers-pace",
    phases: ["day", "dusk"],
    text: "想加快进程时善用旅行者：枪手/官员/屠夫等会让局势更快推进。",
  },
  {
    id: "read-tokens-downtime",
    phases: ["day"],
    text: "白天空闲时翻阅场上角色标记文字，熟悉运作与互动细节，首主持新剧本时尤需如此。",
  },
  {
    id: "close-day-when-ready",
    phases: ["dusk"],
    text: "处决后若夜晚准备就绪可直接让大家闭眼入夜；白天能力要在处决前用完。",
  },
  {
    id: "fun-execution-story",
    phases: ["dusk"],
    text: "处决前可问“你想怎么死？”并简短描述故事，保持有趣但避免不适话题。",
  },
  {
    id: "respect-rules",
    phases: ["any"],
    text: "不要篡改核心规则或随意改动角色数量；公平信息才让推理有意义。",
  },
  {
    id: "let-players-decide",
    phases: ["day", "night", "dusk"],
    text: "玩家的奇怪选择也是策略，不要强迫改动；他们有权坚持自己的判断。",
  },
  {
    id: "handle-toxic",
    phases: ["day", "dusk"],
    text: "发现情绪勒索或冒犯言论时私下劝阻，强调问题在行为而非个人，必要时请其退出本局。",
  },
  {
    id: "avoid-sensitive",
    phases: ["any"],
    text: "避开死亡、性别等敏感话题；若有角色让人不适，提前从剧本列表中移除。",
  },
  {
    id: "shy-player",
    phases: ["day", "dusk"],
    text: "为害羞玩家创造发言窗口，提名时询问是否要发言；让其他人安静聆听。",
  },
  {
    id: "aim-for-final-day",
    phases: ["day", "dusk", "night"],
    text: "尽量把局面带到最后一天，适度给弱势阵营一些运气但不改规则，让高潮由玩家选择决定。",
  },
  {
    id: "support-evil-bluffs",
    phases: ["night", "day"],
    text: "记住邪恶方的伪装并配合演出：假装移动贞洁者等标记，让谎言更可信。",
  },
  {
    id: "announce-win-hype",
    phases: ["gameOver", "dawnReport", "dusk"],
    text: "宣布胜利时稍作停顿，用隆重语气鼓励获胜方尽情欢呼击掌，增强仪式感。",
  },
  {
    id: "allow-creative",
    phases: ["any"],
    text: "允许有趣的创新策略但禁止以游戏外利益或欺凌换取行为，确保乐趣不变味。",
  },
  {
    id: "wake-evil-together",
    phases: ["firstNight"],
    text: "若剧本允许，可尝试首夜同时唤醒恶魔与爪牙再分别指示信息，体验不同节奏。",
  },
  {
    id: "fun-first",
    phases: ["any"],
    text: "所有决定以“让游戏好玩且公平”为准，不要为自己的娱乐牺牲玩家体验。",
  },
];

/**
 * 生成当前阶段的提示，优先输出动态胜负提醒，再附加阶段提示
 */
export function getStorytellerTips(ctx: TipContext): string[] {
  const computeIsGood = (seat: Seat) => {
    if (ctx.isGoodAlignment) return ctx.isGoodAlignment(seat);
    return seat.role?.type === "townsfolk" || seat.role?.type === "outsider";
  };

  const aliveCore = ctx.seats.filter(
    (s) => s.role && s.role.type !== "traveler" && !s.isDead
  );
  const aliveGood = aliveCore.filter((s) => computeIsGood(s));
  const aliveEvil = aliveCore.filter((s) => !computeIsGood(s));

  const derived: DerivedContext = { aliveCore, aliveGood, aliveEvil };
  const result: string[] = [];
  const seen = new Set<string>();
  const pushTip = (tip: string) => {
    if (!seen.has(tip)) {
      seen.add(tip);
      result.push(tip);
    }
  };

  // 动态胜负提醒：全员邪恶
  if (aliveCore.length > 0 && aliveGood.length === 0 && aliveEvil.length > 0) {
    pushTip("⚠️ 全部存活玩家为邪恶阵营，恶魔无法再被提名，可考虑直接宣布邪恶获胜。");
  }

  // 动态胜负提醒：四人局末日情形
  if (
    ctx.gamePhase === "dusk" &&
    aliveCore.length === 4 &&
    aliveGood.length > 0 &&
    aliveEvil.length > 0
  ) {
    pushTip("⚠️ 仅剩4名存活时若善良处决的不是恶魔，夜里恶魔可直接收割结束；若僧侣或士兵仍活着则需再判一次。");
  }

  // 选择与阶段匹配的基础提示
  const baseTips = BASE_TIPS.filter((tip) => {
    return (
      tip.phases.includes("any") ||
      tip.phases.includes(ctx.gamePhase) ||
      (ctx.gamePhase === "night" && tip.phases.includes("firstNight")) // 兼容首夜与其他夜晚
    );
  });

  for (const tip of baseTips) {
    if (tip.when && !tip.when({ ...ctx, ...derived })) continue;
    pushTip(tip.text);
    if (result.length >= 6) break; // 控制界面显示量，避免刷屏
  }

  return result;
}

