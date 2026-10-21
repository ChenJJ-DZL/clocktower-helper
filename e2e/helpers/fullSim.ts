/**
 * 全真随机整局模拟（2026-10-20）
 * ============================================================
 * 目标：像真人说书人一样把一局玩到底 —— 夜间技能随机选目标、
 * 白天随机提名/随机投票/随机处决，每个步骤后抓快照校验不变量，
 * 用以发现「钉死阵容脚本化测试」覆盖不到的崩溃/状态漂移/卡死。
 *
 * 不变量清单（每步一查）：
 *   I1 座位数守恒（开局 N 人 ⇒ 快照恒 N）
 *   I2 死亡单调（已死者不复活；罂粟花开无复活能力）
 *   I3 幽灵票 ⇒ 必为死者
 *   I4 gamePhase ∈ 合法集合
 *   I5 UI 零 pageerror（JS 崩溃即违规）
 *   I6 弹窗可推进（驱动器超时 = 卡死违规）
 *   I7 胜局与官方终局四条一致（good ⇒ 恶魔全灭；evil ⇒ 存活≤2）
 *   I8 每步操作后日志有增长（动作落库，非空转）
 *   I9 中央面板与座位环零相交（day 边界，复用几何判据）
 */
import type { Page } from "@playwright/test";
import { readSnapshot } from "./scriptFlow";
import { measureCenterHud } from "./centerHudGeometry";

export interface Violation {
  invariant: string;
  step: string;
  detail: string;
}

export interface SimContext {
  playerCount: number;
  deadSet: Set<number>;
  lastLogLen: number;
  step: string;
  violations: Violation[];
}

export function makeSimContext(playerCount: number): SimContext {
  return {
    playerCount,
    deadSet: new Set(),
    lastLogLen: 0,
    step: "init",
    violations: [],
  };
}

/** 确定性 PRNG（mulberry32）——同种子必须复现同一局 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 洗牌（Fisher-Yates） */
export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 读取「活终态」（终局 UI 层）。
 * ⚠️ 为什么不能只信快照：`useGameController` 的保存守卫**故意**在
 *   winResult/gameOver 时不落盘（persistence.ts:258 拒载带 winResult 的快照，
 *   终局不可续局）⇒ localStorage 停在终局前一刻（2026-10-20 实测：
 *   页面「邪恶阵营胜利 + 7号已死亡」而快照 11 人全活/winResult 空）。
 *   终局校验一律走 DOM/HUD/终局弹窗的活状态。
 */
/**
 * 🏁 读取终局卡片里的「胜利依据」文案。
 *   必须在终局弹窗**已打开**时调用（未打开时先点「查看获胜结果」）。
 *   拿不到就返回 null —— 判据会因此报红，不许静默放过。
 */
export async function readWinReasonFromOverlay(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const norm = (t: string) => t.replace(/\s+/g, "");
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (el.children.length > 0) continue;
      if (norm(el.textContent || "") !== "胜利依据") continue;
      const card = (el as HTMLElement).closest("div")?.parentElement;
      const p = card?.querySelector("p");
      if (p) return norm(p.textContent || "").slice(0, 120);
    }
    return null;
  });
}

export async function readLiveEndState(page: Page): Promise<{
  winner: string | null; // "good" | "evil" | null
  winnerText: string | null;
  /** 终局「胜利依据」文案（专属胜利必须靠它自证） */
  winnerReason: string | null;
  deadSeats: number[];
  gameOverUi: boolean;
}> {
  return page.evaluate(() => {
    // ⚠️ 胜负文本必须「叶子精确匹配」：角色描述长句里含「阵营胜利」字样
    //   （镜像双子范例等），用 includes 会开局即误判。叶子节点整句等于
    //   标题文本的只有 HUD/终局弹窗。
    const norm = (t: string) => t.replace(/\s+/g, "");
    let winnerText: string | null = null;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (el.children.length > 0) continue;
      const t = norm(el.textContent || "").replace(/^🏆/, "");
      if (t === "善良阵营胜利" || t === "邪恶阵营胜利") {
        winnerText = t;
        break;
      }
    }
    // 胜利依据：终局卡片里「胜利依据」标签后的第一个 <p>
    let winnerReason: string | null = null;
    // ① 终局卡片（需要先点开「查看获胜结果」才在 DOM 里）
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (el.children.length > 0) continue;
      if (norm(el.textContent || "") !== "胜利依据") continue;
      const card = el.closest("div")?.parentElement;
      const p = card?.querySelector("p");
      if (p) winnerReason = norm(p.textContent || "").slice(0, 120);
      break;
    }
    // ② 对局日志（终局那一刻必然写一条「☠️ <胜因>：XX阵营获胜！」）
    if (!winnerReason) {
      try {
        const raw = window.localStorage.getItem("clocktower_current_snapshot");
        const logs = raw ? (JSON.parse(raw).gameLogs ?? []) : [];
        for (let i = logs.length - 1; i >= 0; i--) {
          const msg = String((logs[i] as any)?.message ?? "");
          const m = msg.match(/☠️\s*(.+?)：(?:善良|邪恶)阵营获胜/);
          if (m) {
            winnerReason = m[1].trim().slice(0, 120);
            break;
          }
        }
      } catch {
        /* 读不到就算了，交给判据报红 */
      }
    }

    // 死亡标记：只扫 .seat-node 座位卡（避免祖先容器捎带别座文本）
    const deadSeats: number[] = [];
    for (const el of Array.from(document.querySelectorAll(".seat-node"))) {
      const t = el.textContent || "";
      const idAttr = el.getAttribute("data-seat-id");
      const numM = norm(t).match(/^(\d+)/);
      const id = idAttr !== null ? Number(idAttr) : numM ? Number(numM[1]) - 1 : NaN;
      if (Number.isFinite(id) && /已死亡/.test(t) && !deadSeats.includes(id)) {
        deadSeats.push(id);
      }
    }
    const hasGameOverBtn = Array.from(document.querySelectorAll("button")).some((b) =>
      /查看获胜结果/.test(norm(b.textContent || ""))
    );
    return {
      winner: winnerText === "善良阵营胜利" ? "good" : winnerText === "邪恶阵营胜利" ? "evil" : null,
      winnerText,
      winnerReason,
      deadSeats: deadSeats.sort((a, b) => a - b),
      gameOverUi: hasGameOverBtn,
    };
  });
}

const LEGAL_PHASES = new Set([
  "scriptSelection",
  "setup",
  "firstNight",
  "otherNight",
  "night",
  "day",
  "dusk",
  "twilight",
  "dawnReport",
  "check",
  "gameOver",
  "gameover",
  "ended",
  "victory",
]);

/**
 * 不变量检查器：读真实快照逐条校验。
 * @param checkWin 是否校验终局四条（仅 winResult 非空时触发）
 */
export async function checkInvariants(
  page: Page,
  ctx: SimContext,
  opts: { checkWin?: boolean; checkHud?: boolean } = {}
): Promise<void> {
  const snap = await readSnapshot(page);
  const V = (invariant: string, detail: string) =>
    ctx.violations.push({ invariant, step: ctx.step, detail });

  if (!snap) {
    V("I0-snapshot", "快照不存在（localStorage 未写入）");
    return;
  }

  // I1 座位数守恒
  const seats: any[] = snap.seats ?? [];
  if (seats.length !== ctx.playerCount) {
    V("I1-seats", `座位数 ${seats.length} ≠ 开局 ${ctx.playerCount}`);
  }

  // I2 死亡单调 + I3 幽灵票
  for (const s of seats) {
    if (s.isDead) {
      if (ctx.deadSet.has(s.id) === false) ctx.deadSet.add(s.id);
    } else if (ctx.deadSet.has(s.id)) {
      // 罂粟花开无复活能力 ⇒ 已死者不应回到存活
      V("I2-resurrect", `${s.id + 1}号曾死又被复活（罂粟花开无复活能力）`);
    }
    if (s.hasGhostVote && !s.isDead) {
      V("I3-ghost", `${s.id + 1}号存活却带幽灵票`);
    }
  }

  // I4 相位合法
  const phase = String(snap.gamePhase ?? "");
  if (phase && !LEGAL_PHASES.has(phase)) {
    V("I4-phase", `未知相位 gamePhase=${phase}`);
  }

  // I8 日志增长（驱动器每步调用一次，非零调用间隔）
  const logLen = Array.isArray(snap.logs) ? snap.logs.length : 0;
  if (ctx.lastLogLen > 0 && logLen < ctx.lastLogLen) {
    V("I8-log", `日志条数回退 ${ctx.lastLogLen} → ${logLen}`);
  }
  ctx.lastLogLen = logLen;

  // I7 终局四条（官方：good=恶魔死 / evil=存活≤2 / 善良优先）
  if (opts.checkWin && snap.winResult) {
    const demons = seats.filter(
      (s) =>
        s.role?.type === "demon" ||
        ["imp", "vortox", "legion", "shabaloth", "pukka", "zombuul", "po"].includes(
          s.role?.id ?? ""
        )
    );
    const demonsAllDead =
      demons.length > 0 && demons.every((s) => s.isDead === true);
    const alive = seats.filter((s) => !s.isDead).length;
    const wr = String(snap.winResult);
    if (wr === "good" && !demonsAllDead) {
      V("I7-win", `winResult=good 但恶魔未全灭（alive=${alive}）`);
    }
    if (wr === "evil" && demonsAllDead && alive > 2) {
      V("I7-win", `winResult=evil 但恶魔全灭且存活 ${alive} > 2（善良优先应 good）`);
    }
  }

  // I9 中央面板 vs 座位环（day 边界才查，避免夜序面板干扰）
  if (opts.checkHud) {
    try {
      const g = await measureCenterHud(page);
      const bad = (g.overlapSeats ?? []).filter((o) => o.area > 0);
      if (bad.length > 0) {
        V(
          "I9-hud",
          `中央面板与座位相交 ${bad
            .map((o) => `${o.id ?? "?"}:${Math.round(o.area)}px²`)
            .join(", ")}`
        );
      }
    } catch {
      /* 几何测量失败不计违规（场景不存在 HUD 时） */
    }
  }
}

/**
 * 夜间随机驱动（页面内 evaluate，带种子）。
 * 与 advanceNightFast 同骨架，但：
 *   · 目标选择 = 随机（而非恒取第一个）
 *   · 洗脑师双选 = 随机目标 + 随机疯狂角色
 *   · 「查看魔典」/无按钮步骤 = 主动关闭（ESC / 关闭键），不再报 spy 中断
 */
export interface NightStepRecord {
  stepIdx: number;
  roleName: string | null;
  /** 弹窗标题「N号-步骤名」里的座位 id（0 基）；系统步骤（夜晚结算报告等）为 null */
  seatId: number | null;
  dialogText: string;
  targets: number[];
  /** 步骤确认后从快照读取的首目标状态（无目标为 null） */
  after: {
    /** 目标座位的真实角色 id —— 官方「转火」类豁免的精确判据 */
    roleId?: string | null;
    isProtected?: boolean;
    markedForDeath?: boolean;
    isPoisoned?: boolean;
    isDead?: boolean;
    statusTypes: string[];
  } | null;
  /**
   * ⚠️ 本步骤确认后**整局立即终局**。
   *
   * 2026-10-20 实测（seed=20261020 night#5 军团杀 11 号）：该步骤同时触发了
   * 邪恶阵营胜利 ⇒ 按**既有设计**「终局状态不落快照」（`useGameController` 的
   * 保存守卫排除 gameOver + `persistence.ts` 拒载带 winResult 的快照）⇒
   * `readTargetState` 读到的是**终局前**的冻结快照（`isDead:false`、
   * 无 `markedForDeath`）⇒ I11 误报「击杀未落库」。
   * 而活终态 DOM 已确认该座位死亡（`deadSeatsLive` 含 seat 10）。
   * ⇒ 终局步骤的效果无法用快照判定，I11 必须跳过（不是放水：活终态另有校验）。
   */
  gameOverAfter?: boolean;
}

/** 夜序队列项（"1. [3号] 疯子(恶魔互认)" ⇒ seatId=2, label="疯子(恶魔互认)"） */
export interface QueueEntry {
  seatId: number;
  label: string;
}

export async function advanceNightRandom(
  page: Page,
  seed: number
): Promise<{
  status: "day" | "gameover" | "timeout";
  journal: NightStepRecord[];
  queue: QueueEntry[];
  /** 执行侧真值：本夜开始时的 `wakeQueueIds` */
  wakeStart?: { ids: number[]; idx: number; night: number; phase: string } | null;
  /** 执行侧真值：本夜结束时的 `wakeQueueIds`（含动态插入） */
  wakeEnd?: { ids: number[]; idx: number; night: number; phase: string } | null;
}> {
  return (await page.evaluate(async (seedNum) => {
    // 浏览器内 LCG（与 mulberry32 不同源没关系，只要确定性）
    let s = (seedNum >>> 0) || 1;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const pick = <T,>(arr: T[]): T | undefined =>
      arr.length ? arr[Math.floor(rand() * arr.length)] : undefined;
    const shuffled = <T,>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    /** 点击后等 DOM 签名变化（真 settle，替代盲等）——超时兜底 */
    const clickSettled = async (el: any, maxMs = 500) => {
      const sig = () =>
        `${document.body.innerHTML.length}|${document.querySelectorAll("button").length}|${(document.querySelector('[role="dialog"]')?.textContent || "").length}`;
      const before = sig();
      el.click();
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        await sleep(25);
        if (sig() !== before) return;
      }
    };
    const norm = (el: any) =>
      ((el?.textContent as string) || "").replace(/\s+/g, "");
    const btnsIn = (root: any) =>
      Array.from(root.querySelectorAll("button")) as any[];
    const bodyText = () => document.body.textContent || "";
    const isDay = () => /第\s*\d+\s*天/.test(bodyText());
    const CONFIRM = /确认选择|执行处决|确认|继续|下一步|确定|知道了|完成了/;
    const CANCEL = /取消|返回/;
    const MAX_STEPS = 600;
    let stall = 0;
    let lastSig = "";

    /** 无确认按钮的展示类步骤（魔典/信息只读页）⇒ 主动关闭 */
    const dismissViewer = (dlg: any): boolean => {
      const btns = btnsIn(dlg);
      const closer =
        btns.find((b) => /关闭|知道了|知道了，关闭|收起|✕/.test(norm(b)) && !b.disabled) ??
        btns.find((b) => /知道了|关闭/.test(norm(b)));
      if (closer) {
        closer.click();
        return true;
      }
      // 兜底：Escape 关闭 ModalWrapper
      dlg.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      return true;
    };

    // ⚠️ 终局判定必须「结构化」：只认「🏆 查看获胜结果」按钮（仅 gamePhase=gameOver 渲染）。
    //   禁用 body 文本匹配 —— textContent 含**隐藏 DOM** 的角色描述
    //   （镜像双子范例「邪恶阵营胜利」等）⇒ 开局即误判终局（2026-10-20 实测）。
    /** 阶段真值（快照 gamePhase），避免用文案猜昼夜 */
    const phaseNow = (): string | null => {
      try {
        const raw = window.localStorage.getItem("clocktower_current_snapshot");
        if (!raw) return null;
        return JSON.parse(raw).gamePhase ?? null;
      } catch {
        return null;
      }
    };

    const gameEnded = () =>
      Array.from(document.querySelectorAll("button")).some((b) =>
        /查看获胜结果/.test((b.textContent || "").replace(/\s+/g, ""))
      );

    /** 卡死现场：DOM 文案 + 可见按钮 + 弹窗 + 快照座位真值 */
    const captureStuck = (tag: string) => {
      const dlg = document.querySelector('[role="dialog"]') as HTMLElement | null;
      let snap: any = null;
      try {
        const raw = window.localStorage.getItem("clocktower_current_snapshot");
        snap = raw ? JSON.parse(raw) : null;
      } catch {
        snap = null;
      }
      return {
        tag,
        dayText: (document.body.textContent || "").replace(/\s+/g, "").slice(0, 300),
        dialog: dlg ? (dlg.textContent || "").replace(/\s+/g, "").slice(0, 500) : null,
        buttons: Array.from(document.querySelectorAll("button"))
          .filter((b) => !(b as HTMLButtonElement).disabled)
          .map((b) => ((b.textContent || "").replace(/\s+/g, "")).slice(0, 24))
          .slice(0, 40),
        seats: (snap?.seats ?? []).map((x: any) => ({
          id: x.id,
          role: x.role?.id ?? null,
          isDead: x.isDead === true,
          marked: x.markedForDeath === true,
        })),
      };
    };

    // ── 语义日志：夜序对账 + 效果对账 + 弹窗内容留证 ──
    const journal: any[] = [];
    let stepIdx = 0;
    // 夜序队列（"1. [3号] 僧侣" 形态）——用于 I10 顺序对账
    const readQueue = (): Array<{ seatId: number; label: string }> => {
      const out: Array<{ seatId: number; label: string }> = [];
      const seen = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (el.children.length > 0) continue;
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        const m = t.match(/^\d+\.\s*\[(\d+)号\]\s*(.+)$/);
        if (m && !seen.has(t)) {
          seen.add(t);
          // ⚠️ 必须保留座位号：I10 顺序对账按座位号走（步骤名与队列名
          //    形态不同：弹窗标题是「6号-恶魔互认」，队列是「疯子(恶魔互认)」，
          //    按名字比对必然错位 —— 2026-10-20 实测 14 条 I10 全是这类误报）。
          out.push({ seatId: Number(m[1]) - 1, label: m[2].trim() });
        }
      }
      return out;
    };
    const queue = readQueue();
    /**
     * 🧪 真实执行队列探针（2026-10-20）：
     * 上面 `readQueue()` 读的是**「夜晚行动顺序」预览面板**（`liveNightOrderPreview`），
     * 它是按当前 React state **重算**的，与会话里 `wakeQueueIds`（真正被逐个唤醒的数组）
     * 可能分叉 —— 已实锤两处：预览快照曾漏 `isEvilConverted`（阵营告知不在面板里）、
     * 动态插入（洗脑告知/死亡触发）只进 `wakeQueueIds` 不进面板。
     * ⇒ 读取持久化快照里的 `wakeQueueIds` / `currentWakeIndex` 作为**执行侧真值**留证。
     */
    const readWakeIds = ():
      | { ids: number[]; idx: number; night: number; phase: string }
      | null => {
      try {
        const raw = window.localStorage.getItem("clocktower_current_snapshot");
        if (!raw) return null;
        const snap = JSON.parse(raw);
        if (!Array.isArray(snap.wakeQueueIds)) return null;
        return {
          ids: snap.wakeQueueIds.map((x: any) => Number(x)),
          idx: Number(snap.currentWakeIndex ?? -1),
          night: Number(snap.nightCount ?? -1),
          phase: String(snap.gamePhase ?? "?"),
        };
      } catch {
        return null;
      }
    };
    const wakeStart = readWakeIds();
    const readTargetState = (seatId: number | null) => {
      if (seatId === null) return null;
      try {
        const raw = window.localStorage.getItem("clocktower_current_snapshot");
        if (!raw) return null;
        const snap = JSON.parse(raw);
        const seat = (snap.seats || []).find((x: any) => x.id === seatId);
        if (!seat) return null;
        return {
          roleId: seat.role?.id ?? null,
          isProtected: !!seat.isProtected,
          markedForDeath: !!seat.markedForDeath,
          isPoisoned: !!seat.isPoisoned,
          isDead: !!seat.isDead,
          statusTypes: (seat.statusEffects || []).map((e: any) => String(e.type)),
        };
      } catch {
        return null;
      }
    };
    const makeEntry = (dlg: any, targets: number[]) => {
      const dt = (dlg?.textContent || "").replace(/\s+/g, " ").trim();
      // 标题形态「🌙 6号-恶魔互认 - 行动确认」/「3号-赏金猎人 - 结果」：
      //   ① 座位号从「N号-」前缀取（0 基）；② 步骤名取「N号-」与「 - 行动确认/结果」之间。
      //   ⚠️ 旧实现标题正则被「6号-恶魔互认」里的连字符打断 ⇒ 名字丢失；
      //   回退 includes() 又把描述文本里的「恶魔爪牙互认」「伪装：【厨师】」误认成角色名。
      let seatId: number | null = null;
      let roleName: string | null = null;
      const tm = dt.match(/(\d+)号-([^\s]{1,12}?)\s*-\s*(?:行动确认|结果)/);
      if (tm) {
        seatId = Number(tm[1]) - 1;
        roleName = tm[2].trim();
      } else {
        // 系统步骤（夜晚结算报告 / 只读页）：无「N号-」前缀 ⇒ seatId 留空
        const tm2 = dt.match(/🌙\s*([^\s\-]{1,12}?)\s*-\s*行动确认/);
        if (tm2) roleName = tm2[1].trim();
      }
      return {
        stepIdx: stepIdx++,
        roleName,
        seatId,
        dialogText: dt.slice(0, 160),
        targets,
        after: null as any,
        gameOverAfter: false,
      };
    };

    for (let i = 0; i < MAX_STEPS; i++) {
      if (isDay()) return { status: "day", journal, queue };
      if (gameEnded()) return { status: "gameover", journal, queue };

      const dlg = document.querySelector('[role="dialog"]');
      const sig = `${dlg ? norm(dlg).slice(0, 60) : ""}||${
        btnsIn(document).find((b) => /下一步|天亮了/.test(norm(b)))
          ? norm(btnsIn(document).find((b) => /下一步|天亮了/.test(norm(b))))
          : ""
      }`;
      if (sig === lastSig) {
        stall++;
        if (stall > 45) {
          /**
           * 🔴 2026-10-22（X05 45 局矩阵）：这里原先**直接 `return "timeout"` /
           *   `return "day"`（裸字符串）**，而函数声明返回
           *   `{status, journal, queue, wakeStart, wakeEnd}` ⇒ 调用方拿到字符串：
           *     · `nightRun.status === undefined`（走路径判断全失效）
           *     · `nightRun.journal === undefined`（`journal is not iterable` TypeError）
           *   于是「夜间卡死」被伪装成基建崩溃，真正的卡死现场（`__ctStuck`）反而没人看。
           *   实测 94001：`Object.keys(返回值)` = `0..6`（正好是 "timeout" 的 7 个字符）。
           *   ⇒ 必须返回完整对象，让卡死进入 I6-progress 诊断而不是 TypeError。
           */
          if (!isDay()) {
            (window as any).__ctStuck = captureStuck("night-driver-stall");
            return {
              status: "timeout" as const,
              journal,
              queue,
              wakeStart,
              wakeEnd: readWakeIds(),
            };
          }
          return {
            status: "day" as const,
            journal,
            queue,
            wakeStart,
            wakeEnd: readWakeIds(),
          };
        }
      } else {
        stall = 0;
        lastSig = sig;
      }

      if (dlg) {
        const hint = (dlg.textContent || "").replace(/\s+/g, "");

        // 洗脑师双选弹窗：随机目标 + 随机疯狂角色
        const stepTargets: number[] = [];
        const roleGrid = dlg.querySelector('[data-testid="cerenovus-role-grid"]');
        if (roleGrid) {
          const targets = shuffled(
            Array.from(
              dlg.querySelectorAll(
                '[data-testid="cerenovus-target-grid"] button[data-seat-id]'
              )
            ) as any[]
          ).filter((b) => b.getAttribute("data-selected") !== "true" && !b.disabled);
          const t = pick(targets);
          if (t) {
            t.click();
            const sid = t.getAttribute("data-seat-id");
            if (sid !== null) stepTargets.push(Number(sid));
            await sleep(30);
          }
          const caps = shuffled(
            Array.from(roleGrid.querySelectorAll("button[data-role-id]")) as any[]
          ).filter((b) => b.getAttribute("data-selected") !== "true" && !b.disabled);
          const c = pick(caps);
          if (c) {
            await clickSettled(c, 30);
          }
        } else if (/请选择目标玩家/.test(hint)) {
          // 通用目标选择：随机挑 need 个
          const m = hint.match(/最少(\d+)人/);
          let need = m ? Number(m[1]) : 1;
          const maxM = hint.match(/最多(\d+)人/);
          const maxN = maxM ? Number(maxM[1]) : need;
          if (maxN > need) need = need + Math.floor(rand() * (maxN - need + 1));
          const cards = shuffled(btnsIn(dlg).filter((b) => /^\d+号/.test(norm(b)))).filter(
            (c) => !c.disabled
          );
          let picked = 0;
          for (const c of cards) {
            if (picked >= need) break;
            if (norm(c).includes("(自己)") && cards.length > need) continue;
            c.click();
            const m2 = norm(c).match(/^(\d+)号/);
            if (m2) stepTargets.push(Number(m2[1]) - 1);
            picked++;
            await sleep(25);
          }
        }

        const ok =
          btnsIn(dlg).find((b) => CONFIRM.test(norm(b)) && !b.disabled) ??
          btnsIn(dlg).find((b) => !b.disabled && !CANCEL.test(norm(b)));
        if (ok) {
          const entry = makeEntry(dlg, stepTargets);
          await clickSettled(ok, 180);  // 等 stateUpdate 落库
          entry.after = readTargetState(stepTargets[0] ?? null);
          // 终局快照按设计不落盘 ⇒ 记录该步是否触发终局，供 I11 判定时跳过
          entry.gameOverAfter = gameEnded();
          journal.push(entry);
          continue;
        }
        // 无可点按钮（魔典/只读展示）⇒ 主动关闭（同样留证）
        {
          const entry = makeEntry(dlg, stepTargets);
          dismissViewer(dlg);
          await sleep(80);
          entry.after = readTargetState(stepTargets[0] ?? null);
          journal.push(entry);
        }
        continue;
      }

      const next = btnsIn(document).find(
        (b) => /确认&下一步|下一步|天亮了/.test(norm(b)) && !b.disabled
      );
      if (next) {
        await clickSettled(next, 45);
        continue;
      }
      await sleep(45);
    }
    return {
      status: (() => {
        const phase = phaseNow();
        if (gameEnded() || phase === "gameOver") return "gameover";
        if (phase === "day" || phase === "dusk" || phase === "dawnReport")
          return "day";
        if (isDay()) return "day";
        (window as any).__ctStuck = captureStuck("night-driver-end");
        return "timeout";
      })(),
      journal,
      queue,
      wakeStart,
      wakeEnd: readWakeIds(),
    };
  }, seed)) as {
    status: "day" | "gameover" | "timeout";
    journal: NightStepRecord[];
    queue: QueueEntry[];
    /** 执行侧真值：本夜开始时的 `wakeQueueIds`（含动态插入前的原始队列） */
    wakeStart?: { ids: number[]; idx: number; night: number; phase: string } | null;
    /** 执行侧真值：本夜结束时的 `wakeQueueIds`（含洗脑告知等动态插入） */
    wakeEnd?: { ids: number[]; idx: number; night: number; phase: string } | null;
  };
}

/**
 * 白天/黄昏随机驱动：日间门禁随机抉择 → 进黄昏 → 随机提名
 * → 随机投票 → 处决弹窗确认 → 入夜。
 */
export async function driveDuskRandom(
  page: Page,
  seed: number
): Promise<{
  status: "night" | "gameover" | "timeout";
  /** 处决结算留痕（本昼最后一次结算）；无提名通过时为 null */
  executed: DuskExecRecord | null;
}> {
  const status = (await page.evaluate(async (seedNum) => {
    let s = (seedNum >>> 0) || 1;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const pick = <T,>(arr: T[]): T | undefined =>
      arr.length ? arr[Math.floor(rand() * arr.length)] : undefined;
    const shuffled = <T,>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    /** 点击后等 DOM 签名变化（真 settle，替代盲等）——超时兜底 */
    const clickSettled = async (el: any, maxMs = 500) => {
      const sig = () =>
        `${document.body.innerHTML.length}|${document.querySelectorAll("button").length}|${(document.querySelector('[role="dialog"]')?.textContent || "").length}`;
      const before = sig();
      el.click();
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        await sleep(25);
        if (sig() !== before) return;
      }
    };
    const norm = (el: any) =>
      ((el?.textContent as string) || "").replace(/\s+/g, "");
    const allBtns = () => Array.from(document.querySelectorAll("button")) as any[];

    /**
     * 白天驱动的卡死留证。
     * ⚠️ 夜间驱动早就有 captureStuck，白天驱动一直没有 ⇒ 「dusk 超时」只剩一行
     *   文案，无从判断是「按钮被禁用」还是「弹窗没关」。这里补上同样的现场快照。
     */
    const duskCapture = (tag: string): "timeout" => {
      try {
        const dlg = document.querySelector('[role="dialog"]') as HTMLElement | null;
        let snap: any = null;
        try {
          const raw = window.localStorage.getItem("clocktower_current_snapshot");
          snap = raw ? JSON.parse(raw) : null;
        } catch {
          snap = null;
        }
        (window as any).__ctStuck = {
          tag,
          dialog: dlg
            ? (dlg.textContent || "").replace(/\s+/g, "").slice(0, 500)
            : null,
          bodyText: (document.body.textContent || "")
            .replace(/\s+/g, "")
            .slice(0, 400),
          buttons: Array.from(document.querySelectorAll("button"))
            .filter((b) => !(b as HTMLButtonElement).disabled)
            .map((b) => ((b.textContent || "").replace(/\s+/g, "")).slice(0, 24))
            .slice(0, 40),
          disabledButtons: Array.from(document.querySelectorAll("button"))
            .filter((b) => (b as HTMLButtonElement).disabled)
            .map((b) => ((b.textContent || "").replace(/\s+/g, "")).slice(0, 24))
            .slice(0, 20),
          seats: (snap?.seats ?? []).map((x: any) => ({
            id: x.id,
            role: x.role?.id ?? null,
            isDead: x.isDead === true,
            marked: x.markedForDeath === true,
          })),
          phase: snap?.gamePhase ?? null,
          nightCount: snap?.nightCount ?? null,
        };
      } catch {}
      return "timeout";
    };
    const text = () => document.body.textContent || "";
    const CONFIRM = /执行处决|确认|提交|确定|继续|下一步|完成了|知道了|好的/;
    const CANCEL = /取消|返回/;
    // ⚠️ 终局判定结构化（同夜间驱动）：只认「查看获胜结果」按钮。
    const gameEnded = () =>
      Array.from(document.querySelectorAll("button")).some((b) =>
        /查看获胜结果/.test((b.textContent || "").replace(/\s+/g, ""))
      );

    const pageSig = () =>
      (document.body.textContent || "").length +
      "|" +
      document.querySelectorAll('[role="dialog"]').length +
      "|" +
      document.querySelectorAll("button:not([disabled])").length;
    const clickAndSettle = async (btn: any, maxMs = 3000): Promise<boolean> => {
      const before = pageSig();
      btn.click();
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        if (pageSig() !== before) return true;
        await sleep(80);
      }
      await sleep(250);
      return false;
    };
    const clickByPattern = async (re: RegExp): Promise<boolean> => {
      const b = allBtns().find((x) => re.test(norm(x)) && !x.disabled);
      if (!b) return false;
      await clickAndSettle(b);
      return true;
    };

    // ── 0：日间门禁随机抉择（疯狂仲裁/疯狂洗脑等）──
    const GATE_BTN = /疯狂仲裁|疯狂洗脑|^(使用|发动|进行).+|判定(?!$)/;
    const isHintBtn = (t: string) => /^需先完成|^请先|^待完成/.test(t);
    for (let g = 0; g < 12; g++) {
      const candidates = allBtns().filter(
        (b) => !b.disabled && !isHintBtn(norm(b)) && GATE_BTN.test(norm(b))
      );
      const duskBtnDisabled = allBtns().find((b) => /进入黄昏/.test(norm(b)))
        ?.disabled === true;
      const gated = /需先完成|请先完成/.test(text());
      if (candidates.length === 0) break;
      if (!gated && !duskBtnDisabled) break;

      // 随机挑一个门禁/日间技能发动
      const chosen = pick(candidates);
      if (!chosen) break;
      await clickAndSettle(chosen);
      for (let k = 0; k < 14; k++) {
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg) break;
        const dlgBtns = Array.from(dlg.querySelectorAll("button")) as any[];
        // 判定类弹窗：随机在「保守项」与「处决项」间抉择（真随机压测）
        const decisionBtns = dlgBtns.filter(
          (b) => /无事发生|执行处决|通过/.test(norm(b)) && !b.disabled
        );
        if (decisionBtns.length > 0 && /判定|疯狂|仲裁/.test((dlg.textContent || "").replace(/\s+/g, ""))) {
          const d = pick(decisionBtns)!;
          await clickSettled(d, 400);
          continue;
        }
        const ok =
          dlgBtns.find((b) => CONFIRM.test(norm(b)) && !b.disabled && !/取消/.test(norm(b))) ??
          dlgBtns.find((b) => CONFIRM.test(norm(b)) && !b.disabled) ??
          dlgBtns.find((b) => !b.disabled);
        if (!ok) break;
        await clickSettled(ok, 320);
      }
    }
    if (gameEnded()) return "gameover";

    // ── 1：进入黄昏 ──
    for (let i = 0; i < 8; i++) {
      const entered =
        /黄昏/.test(text()) &&
        !allBtns().some((b) => /进入黄昏/.test(norm(b)) && !b.disabled);
      if (entered) break;
      if (!(await clickByPattern(/进入黄昏/))) break;
    }

    // ── 入夜（必须先结算处决；入夜后验证相位真的变了）──
    // ⚠️ 应用守卫：有未结算处决时点「入夜」会弹「处决未结算」确认框
    //   （confirmLabel=执行处决 / cancelLabel=返回）——处决不可跳过（官方规则）。
    //   2026-10-20 实测：驱动器误点「返回」曾造成黄昏死循环假卡死。
    /** 阶段真值（快照 gamePhase），避免用文案猜昼夜 */
    const phaseNow = (): string | null => {
      try {
        const raw = window.localStorage.getItem("clocktower_current_snapshot");
        if (!raw) return null;
        return JSON.parse(raw).gamePhase ?? null;
      } catch {
        return null;
      }
    };

    const gameEndedBtn = () =>
      Array.from(document.querySelectorAll("button")).some((b) =>
        /查看获胜结果/.test((b.textContent || "").replace(/\s+/g, ""))
      );
    /**
     * 读取快照里的死亡座位集合（0 基 id）。
     *
     * 用途：处决结算前后 diff ⇒ 判「处决是否真的落了死亡」。
     * ⚠️ 终局状态按设计不落快照，此时 `after` 会是终局前的冻结值，
     *    由 `gameOver` 标记区分，判定侧必须跳过（见 verifyDuskSemantics）。
     */
    const readDeadIds = (): number[] | null => {
      try {
        const raw = window.localStorage.getItem("clocktower_current_snapshot");
        if (!raw) return null;
        const snap = JSON.parse(raw);
        return (snap.seats ?? [])
          .filter((s: any) => s.isDead)
          .map((s: any) => Number(s.id));
      } catch {
        return null;
      }
    };
    (window as any).__duskExecLog = null;
    /** 处决过程中最后一帧弹窗文案（识别免死类处决用） */
    let duskDlgText = "";

    const settleAndEnterNight = async (): Promise<"night" | "gameover" | null> => {
      // ① 先点「执行处决结算」（提名通过后的正式结算入口）
      let execBefore: number[] | null = null;
      let didExec = false;
      for (let k = 0; k < 3; k++) {
        const settle = allBtns().find(
          (b) => /执行处决结算/.test(norm(b)) && !b.disabled
        );
        if (!settle) break;
        if (!didExec) execBefore = readDeadIds();
        didExec = true;
        await clickAndSettle(settle);
        // 结算可能弹确认框
        for (let j = 0; j < 8; j++) {
          const dlg = document.querySelector('[role="dialog"]');
          if (!dlg) break;
          duskDlgText = (dlg.textContent || "").replace(/\s+/g, "");
          const dlgBtns = Array.from(dlg.querySelectorAll("button")) as any[];
          const ok =
            dlgBtns.find((b) => /执行处决|确认/.test(norm(b)) && !b.disabled && !CANCEL.test(norm(b))) ??
            dlgBtns.find((b) => !b.disabled && !CANCEL.test(norm(b)));
          if (!ok) break;
          await clickSettled(ok, 350);
        }
        await sleep(250);
      }
      if (didExec) {
        (window as any).__duskExecLog = {
          before: execBefore,
          after: readDeadIds(),
          gameOver: gameEndedBtn(),
          resultText: duskDlgText.slice(0, 200),
          executedRoleId: (() => {
            const m = duskDlgText.match(/【(\d+)号被处决】/);
            if (!m) return null;
            const seatId = Number(m[1]) - 1;
            try {
              const raw = window.localStorage.getItem("clocktower_current_snapshot");
              const snap = raw ? JSON.parse(raw) : null;
              const seat = (snap?.seats ?? []).find((x: any) => Number(x.id) === seatId);
              return seat?.role?.id ?? null;
            } catch {
              return null;
            }
          })(),
        };
      }
      // ② 点「入夜」并验证相位真的切换（弹「处决未结算」就按「执行处决」）
      for (let k = 0; k < 4; k++) {
        const toNight = allBtns().find((b) => /入夜/.test(norm(b)) && !b.disabled);
        if (!toNight) {
          // 入夜按钮消失 = 已进夜晚（或已终局）
          if (gameEndedBtn()) return "gameover";
          const ph = phaseNow();
          if (ph === "night" || ph === "firstNight" || ph === "twilight")
            return "night";
          if (/夜晚行动顺序|天亮了|唤醒/.test(text())) return "night";
          return null;
        }
        await clickSettled(toNight, 600);
        // 处理「处决未结算」等拦截弹窗
        for (let j = 0; j < 8; j++) {
          const dlg = document.querySelector('[role="dialog"]');
          if (!dlg) break;
          const dlgBtns = Array.from(dlg.querySelectorAll("button")) as any[];
          const ok =
            dlgBtns.find((b) => /执行处决|确认/.test(norm(b)) && !b.disabled && !CANCEL.test(norm(b))) ??
            dlgBtns.find((b) => !b.disabled && !CANCEL.test(norm(b)));
          if (!ok) break;
          await clickSettled(ok, 450);
        }
        // 验证真的入夜：入夜按钮消失 / 夜间特征出现
        await sleep(400);
        const stillDusk = allBtns().some((b) => /入夜/.test(norm(b)) && !b.disabled);
        if (!stillDusk) {
          if (gameEndedBtn()) return "gameover";
          const ph2 = phaseNow();
          if (ph2 === "night" || ph2 === "firstNight" || ph2 === "twilight")
            return "night";
          return "night";
        }
        const ph3 = phaseNow();
        if (ph3 === "night" || ph3 === "firstNight" || ph3 === "twilight")
          return "night";
        if (/夜晚行动顺序|唤醒\d+号/.test(text())) return "night";
      }
      return null;
    };

    // ── 2：随机提名（1~2 次）──
    const rounds = 1 + Math.floor(rand() * 2);
    for (let r = 0; r < rounds; r++) {
      const seatBtns = shuffled(
        allBtns().filter(
          (b) => /^[1-9]\d*$/.test(norm(b)) && !b.disabled && b.offsetParent
        )
      );
      if (seatBtns.length < 2) break;
      // 提名者 + 被提名者（随机两个不同座位）
      await clickSettled(seatBtns[0], 280);
      const second =
        seatBtns.find((b) => norm(b) !== norm(seatBtns[0])) ?? seatBtns[1];
      await clickSettled(second, 280);
      if (await clickByPattern(/确认发起提名/)) {
        await sleep(650);
        // ── 3：投票/处决弹窗 ──
        for (let i = 0; i < 60; i++) {
          if (gameEnded()) return "gameover";
          const dlg = document.querySelector('[role="dialog"]');
          if (dlg) {
            const dlgText = (dlg.textContent || "").replace(/\s+/g, "");
            const dlgBtns = Array.from(dlg.querySelectorAll("button")) as any[];

            // 举手表决计票弹窗：随机勾选投票者
            if (/举手表决计票/.test(dlgText)) {
              const voters = shuffled(
                dlgBtns.filter(
                  (b) =>
                    /^\d+号/.test(norm(b)) &&
                    !b.disabled &&
                    !/取消|确认/.test(norm(b))
                )
              );
              // 随机 40%~100% 投票率
              const rate = 0.4 + rand() * 0.6;
              const nVote = Math.max(1, Math.floor(voters.length * rate));
              for (let v = 0; v < nVote && v < voters.length; v++) {
                await clickSettled(voters[v], 35);
              }
              const confirmVote = dlgBtns.find(
                (b) => /确认（|确认\(/.test(norm(b)) && !b.disabled
              ) ?? dlgBtns.find((b) => /^确认/.test(norm(b)) && !b.disabled);
              if (confirmVote) {
                await clickSettled(confirmVote, 500);
                continue;
              }
            }

            // 判定类：随机抉择
            const decisionBtns = dlgBtns.filter(
              (b) => /无事发生|执行处决|通过/.test(norm(b)) && !b.disabled
            );
            if (decisionBtns.length > 0 && /判定|疯狂|仲裁|处决确认/.test(dlgText)) {
              const d = pick(decisionBtns)!;
              await clickSettled(d, 400);
              continue;
            }

            const ok =
              dlgBtns.find(
                (b) => CONFIRM.test(norm(b)) && !b.disabled && !/取消/.test(norm(b))
              ) ??
              dlgBtns.find((b) => CONFIRM.test(norm(b)) && !b.disabled) ??
              dlgBtns.find((b) => !b.disabled);
            if (ok) {
              await clickSettled(ok, 320);
              continue;
            }
          }
          const toNight = allBtns().find((b) => /入夜/.test(norm(b)) && !b.disabled);
          if (toNight) {
            const r = await settleAndEnterNight();
            if (r) return r;
            return duskCapture("dusk-enter-night-no-status");
          }
          await sleep(220);
        }
      }
    }

    // ── 收尾：提名轮结束后仍要入夜 ──
    const r = await settleAndEnterNight();
    return r ?? duskCapture("dusk-driver-timeout");
  }, seed)) as "night" | "gameover" | "timeout";

  const executed = (await page.evaluate(
    () => (window as any).__duskExecLog ?? null
  )) as DuskExecRecord | null;

  return { status, executed };
}

/** 处决结算留痕：结算前后死亡座位集合（0 基 id） */
export interface DuskExecRecord {
  before: number[] | null;
  after: number[] | null;
  /** 处决过程中最后一帧弹窗文案（用于识别「官方允许的免死处决」） */
  resultText?: string | null;
  /** 被处决者的真实角色 id（从「【N号被处决】」+ 快照反查） */
  executedRoleId?: string | null;
  /** 该次结算后是否立即终局（终局不落快照，after 可能是冻结值） */
  gameOver: boolean;
}


/**
 * 白天语义对账（I14）：处决结算必须**真的死人**。
 *
 * 为什么需要：白天驱动此前只校验「不超时 + 几何不重叠」，**不校验处决结果**。
 * 于是「点了执行处决结算、弹窗也关了、但目标没死」这类技能/规则 bug 完全
 * 无法被发现（只有终局四条 I7 能间接覆盖极小一部分）。
 *
 * 判据（官方规则）：一次处决结算后，死亡人数必须**恰好 +1**。
 *   · +0 ⇒ 处决没生效（真 bug）；
 *   · ≥2 ⇒ 一次处决死了多人（除非有官方连锁，本剧本 24 角色池内不存在）。
 * 市长「转移」不会破坏判据：被处决者不死，但有且仅有 1 名他人死亡。
 *
 * ⚠️ 终局跳过：终局状态按设计不落快照，`after` 是终局前冻结值 ⇒ 必然假阴性/假阳性。
 */
export function verifyDuskSemantics(
  executed: DuskExecRecord | null | undefined
): Violation[] {
  const out: Violation[] = [];
  if (!executed) return out;
  if (executed.gameOver) return out; // 终局不落快照（见 NightStepRecord.gameOverAfter 注释）
  const { before, after } = executed;
  if (!before || !after) return out; // 没读到快照，无判据

  const beforeSet = new Set(before);
  const newlyDead = after.filter((id) => !beforeSet.has(id));
  /**
   * 官方允许「处决但不死」的角色：和平主义者（说书人裁定存活）、弄臣（首次免死）、
   * 士兵/茶艺师/旅店老板等保护、以及替罪羊代刑。判据取处决过程弹窗原文，
   * 命中即豁免；拿不到文案时**照报**（不豁免）。
   */
  const SAVE_RE = /和平主义者|弄臣|士兵|茶艺师|旅店老板|僧侣|代刑|免死|未死亡|不会死亡/;
  /** 官方「处决但不死」的角色（弄臣首次免死 / 和平主义者说书人裁定 / 士兵类保护） */
  const SAVE_ROLE_IDS = new Set([
    "fool",
    "pacifist",
    "soldier",
    "tea_lady",
    "innkeeper",
    "devils_advocate",
  ]);
  const savedByRule =
    SAVE_RE.test(executed.resultText ?? "") ||
    SAVE_ROLE_IDS.has(executed.executedRoleId ?? "");
  if (newlyDead.length === 0 && !savedByRule) {
    out.push({
      invariant: "I14-execute",
      step: "dusk-semantic",
      detail: `执行了处决结算但无新增死亡（处决未落库；死前=${before
        .map((i) => i + 1)
        .join(",")} 死后=${after.map((i) => i + 1).join(",")}）`,
    });
  } else if (newlyDead.length >= 2) {
    out.push({
      invariant: "I14-execute",
      step: "dusk-semantic",
      detail: `一次处决结算新增 ${newlyDead.length} 名死者（${newlyDead
        .map((i) => i + 1)
        .join(",")}号），与官方「一次处决死一人」不符`,
    });
  }
  return out;
}

/**
 * 语义对账（2026-10-20 用户质询「每个弹窗/环节/技能效果都正确吗」）。
 * 三条判据：
 *   I10 顺序：夜间每步的行动角色必须按夜序队列顺序出现
 *   I11 效果：僧侣选人后目标必须 isProtected；小恶魔/军团选人后目标必须
 *            markedForDeath 或已死（技能结算落库，不是只有文案）
 *   I12 信息：信息类角色步骤的弹窗必须有实质内容（info 被展示，不是空壳）
 *   I13 覆盖：弹窗出现过的座位必须在本夜唤醒队列里（防「偷偷多跑一个技能步骤」）
 */
/**
 * 从「夜晚结算报告」里解析出**本夜死亡的座位**（0 基）。
 *
 * 报告文案形如：「💀说书人宣布黎明信息：昨晚1号、4号、9号玩家死亡确认并进入白天」。
 *
 * ⚠️⚠️ 为什么 I13 需要它（2026-10-21 9 剧本矩阵实测）：
 *   死亡触发类角色（瘟疫医生 / 理发师 / 守鸦人 / 智者 …）是在**死亡发生之后**
 *   才被动态唤醒的，而唤醒队列是**夜晚开始前**生成的快照 ⇒ 它们必然不在队列里。
 *   实测两例：窃窃私语 1号瘟疫医生被「珀」杀死后醒、凶宅魅影 6号理发师被刺客
 *   暗杀后醒 —— 行为完全正确，但 I13 直接判成「偷偷多跑一个步骤」。
 *
 *   修法不能靠角色名白名单（会腐烂），必须用**行为判据**：
 *   「该座位本夜确实死了」⇒ 死后唤醒合法；活人跑到队列外 ⇒ 仍然报错。
 */
export function deadSeatsFromNightReport(journal: NightStepRecord[]): Set<number> {
  const out = new Set<number>();
  for (const j of journal) {
    const t = j.dialogText ?? "";
    if (!t.includes("死亡")) continue;
    const m = t.match(/昨晚([^。]{0,120}?)死亡/);
    if (!m) continue;
    for (const g of m[1].matchAll(/(\d+)号/g)) out.add(Number(g[1]) - 1);
  }
  return out;
}

export function verifyNightSemantics(
  journal: NightStepRecord[],
  queue: QueueEntry[],
  /**
   * 执行侧真值（`wakeQueueIds`，可选）。
   *
   * ⚠️⚠️ 2026-10-20 实测教训：`queue` 来自「夜晚行动顺序」**预览面板**，
   * 是按 React state **重算**的，与真正被逐个唤醒的 `wakeQueueIds` 会分叉：
   *   · 面板快照曾漏 `isEvilConverted` → 缺「邪恶阵营告知」首步；
   *   · 动态插入（洗脑告知等）只进 `wakeQueueIds`、不进面板。
   * 首轮 14 条 + 本轮 4 条「步骤越序」**全部**由这类分叉引起（阵营告知与
   * 图书管理员同座位 8，抢走队列槽位 → 后续 5/3/9 号连锁误报）。
   * ⇒ 有执行侧真值时**一律以它为准**，面板队列只作兜底。
   */
  wakeIds?: number[] | null
): Violation[] {
  const out: Violation[] = [];
  const V = (invariant: string, detail: string) =>
    out.push({ invariant, step: "night-semantic", detail });

  /**
   * 系统/插入步骤：**不占队列槽位**（不在 `wakeQueueIds` 里由座位驱动，
   * 或由 `stepOverride` 插入的告知类节点）。名字取自实际弹窗标题。
   *
   * ⚠️ 这些步骤的 `seatId` 可能与某个真实角色**同座位**（如阵营告知 seat8
   * 与图书管理员 seat8），若参与对账必然抢槽位 → 连锁误报。
   */
  const SYSTEM_STEP_RE =
    /^(阵营告知|邪恶阵营告知|技能告知|双子告知|技能修正|夜晚结算报告|洗牌|通知)/;

  // I10 顺序：按**座位号**对账（同一步骤的「行动确认+结果」双弹窗先去重）。
  //   ⚠️ 弹窗标题是步骤名（「6号-恶魔互认」）而队列是角色名（「疯子(恶魔互认)」），
  //   按名字比对必然错位；座位号是两者唯一的共同键。
  const seatSeq: number[] = [];
  for (const j of journal) {
    if (j.seatId === null || j.seatId === undefined) continue;
    if (j.roleName && SYSTEM_STEP_RE.test(j.roleName)) continue; // 系统步骤不占槽位
    if (seatSeq[seatSeq.length - 1] === j.seatId) continue; // 同步骤双弹窗
    seatSeq.push(j.seatId);
  }
  const qSeats: number[] =
    wakeIds && wakeIds.length > 0 ? [...wakeIds] : queue.map((q) => q.seatId);
  if (qSeats.length > 0 && seatSeq.length > 0) {
    let qi = 0;
    for (const seat of seatSeq) {
      const at = qSeats.indexOf(seat, qi);
      if (at === -1) {
        const anywhere = qSeats.indexOf(seat);
        // 允许队列步骤未全部出现在弹窗（只读/自动步骤），但出现的必须有序
        if (anywhere === -1) continue;
        V(
          "I10-order",
          `${seat + 1}号 步骤越序（已在队列位置 ${anywhere + 1} 之前消费过；队列=${
            wakeIds && wakeIds.length > 0
              ? qSeats.map((s) => `${s + 1}号`).join(">")
              : queue.map((q) => `${q.seatId + 1}号:${q.label}`).join(">")
          }）`
        );
      } else {
        qi = at + 1;
      }
    }
  }

  /**
   * I13 覆盖：**弹窗出现过的座位必须在本夜唤醒队列里**（系统/告知类步骤除外）。
   *
   * ⚠️⚠️ 为什么必须有这一条（2026-10-20 教训）：I10 对「座位不在队列里」的
   *   情况是 `continue` 放行的（上面的 `anywhere === -1`），理由是「允许队列
   *   步骤未全部出现在弹窗」。但这把**反方向的错误**一起放过了：
   *   多出来的、根本不该被唤醒的步骤（首夜唤醒了 `firstNightPriority: null`
   *   的神谕者）也「不在队列里」⇒ 同样被静默放过。
   *   上一轮这个真 bug 是靠人工逐条比对 journal 与队列才发现的，验证器当时
   *   给的是绿灯 —— 这属于**验证器假阴性**，比误报危险得多。
   *
   * 判据：以「本夜唤醒队列（执行侧 wakeIds ∪ 预览面板）」为白名单，
   *      弹窗里出现的座位若两者皆无 ⇒ 报 I13。
   *      动态插入的告知类步骤已由 SYSTEM_STEP_RE 排除，不参与。
   */
  const qSeatSet = new Set<number>([
    ...qSeats,
    ...queue.map((q) => q.seatId),
  ]);
  /**
   * 死后唤醒豁免：本夜确实死亡的座位，允许出现在队列之外
   * （死亡触发类能力的**唯一**合法例外，见 `deadSeatsFromNightReport` 注释）。
   * 活人若跑到队列外，下面仍然照常报 I13。
   */
  const diedTonight = deadSeatsFromNightReport(journal);
  // 队列为空（面板与执行侧都没读到）⇒ 无判据，不能把全部座位判成队列外
  for (const seat of qSeatSet.size > 0 ? seatSeq : []) {
    if (diedTonight.has(seat)) continue;
    if (!qSeatSet.has(seat)) {
      V(
        "I13-unqueued",
        `${seat + 1}号 弹窗出现但**不在本夜唤醒队列**（疑似动态插入未声明 stepOverride ⇒ 按真实角色偷偷多跑一个技能步骤；队列=${
          wakeIds && wakeIds.length > 0
            ? qSeats.map((s) => `${s + 1}号`).join(">")
            : queue.map((q) => `${q.seatId + 1}号:${q.label}`).join(">")
        }）`
      );
    }
  }

  /**
   * 施法者自身被干扰的座位（醉酒/中毒 ⇒ 技能合法地不生效）。
   *
   * ⚠️⚠️ 2026-10-20 实测（seed=20261020 第二次跑）：僧侣保护 5 号后
   *   `isProtected:false`，I11 报「效果未生效」——**误报**。结果弹窗原文是
   *   「僧侣试图保护【5号】，但自身醉酒/中毒未生效」，即技能本就该失效。
   *   根因：I11 只写了「选了人就必须有效果」，漏了官方前提「技能生效
   *   ⟺ 施法者未被醉酒/中毒」。这个分支此前从未被随机跑到，所以一直是假绿。
   *
   * 判据来源：结果弹窗文案（「未生效」「醉酒/中毒」）。同座位的「行动确认」
   *   弹窗先落 `after`，结果弹窗后出现 ⇒ 必须先扫全夜建立集合，再做 I11 断言。
   */
  const DISABLED_RE = /未生效|醉酒\/中毒|受到.*(醉酒|中毒).*影响/;
  const disabledSeats = new Set<number>();
  for (const j of journal) {
    if (j.seatId !== null && j.seatId !== undefined && DISABLED_RE.test(j.dialogText)) {
      disabledSeats.add(j.seatId);
    }
  }

  /**
   * 🎯 只判「最终执行步骤」：同一 (座位, 角色) 在一夜里可能出现多次——
   *   preview 的「行动确认」步骤（等说书人在修正窗里选目标）+ 真正的执行步骤。
   *   preview 步骤的快照本就不会有死亡标记 ⇒ 拿它判 I11 必假红。
   *   取「该组合最后一次带目标的步骤」作为判据对象；一次都没带目标则跳过该角色。
   */
  const lastEffectStep = new Map<string, number>();
  for (const j of journal) {
    if (!j.roleName || j.seatId === null || j.seatId === undefined) continue;
    if (!j.after || (j.targets?.length ?? 0) === 0) continue;
    // 「行动确认」预览步骤（带「撤销后可重新发动」按钮）：此时技能**尚未执行**，
    //   说书人可能接着在修正窗里改目标（镇长替死等）⇒ 不能拿它的快照判效果。
    if (/撤销后可重新发动/.test(j.dialogText)) continue;
    lastEffectStep.set(`${j.seatId}|${j.roleName}`, j.stepIdx);
  }

  // I11 效果（只判最终执行步骤，见上面 lastEffectStep 注释）
  for (const j of journal) {
    const key = `${j.seatId}|${j.roleName}`;
    if (lastEffectStep.get(key) !== j.stepIdx) continue;
    if (!j.roleName) continue;
    // 施法者被醉酒/中毒 ⇒ 技能合法失效，不能断言目标必须被影响
    if (j.seatId !== null && disabledSeats.has(j.seatId)) continue;
    // ⚠️ 终局步骤跳过：终局状态按设计**不落快照**（见 NightStepRecord.gameOverAfter
    //    注释与 `outputs/全真模拟-2026-10-20.md` §三「设计注意」），
    //    快照读到的是终局前冻结值 ⇒ 只能误报。终局后果由活终态（deadSeatsLive + 官方四条）校验。
    if (j.gameOverAfter) continue;
    const t = j.targets[0] ?? null;
    if (/僧侣/.test(j.roleName) && t !== null && j.after) {
      if (!j.after.isProtected && !j.after.statusTypes.includes("protected")) {
        V("I11-effect", `僧侣选中 ${t + 1}号 后目标未落 isProtected（效果未生效）`);
      }
    }
    if (/(小恶魔|军团)/.test(j.roleName) && t !== null && j.after) {
      /**
       * 🎩 市长夜杀转火（官方）：「如果你在夜晚被杀，另一名玩家**可能**代替你死亡。」
       *   ⇒ 被攻击的市长**不会** markedForDeath，死者是别人。
       *   豁免必须带反证：当夜**确实有人死了**（diedTonight.size > 0）；
       *   否则击杀就是真的没落库（沉默失败），照样报 I11。
       */
      const mayorRedirect = j.after.roleId === "mayor" && diedTonight.size > 0;
      if (
        !mayorRedirect &&
        !j.after.markedForDeath &&
        !j.after.isDead &&
        !j.after.isProtected
      ) {
        V("I11-effect", `${j.roleName}选中 ${t + 1}号 后目标既无 markedForDeath 也未死亡（击杀未落库）`);
      }
    }
  }

  // I12 信息：信息类角色的弹窗必须有实质内容
  const INFO_ROLES = /图书管理员|厨师|占卜师|神谕者|城镇公告员|博学者|告密者|小精灵|共情者|洗衣妇|调查员|送葬者/;
  for (const j of journal) {
    if (!j.roleName || !INFO_ROLES.test(j.roleName)) continue;
    if (j.dialogText.replace(/\s+/g, "").length < 25) {
      V("I12-info", `信息角色「${j.roleName}」步骤弹窗内容过短（可能信息未展示）：「${j.dialogText.slice(0, 40)}」`);
    }
  }
  return out;
}
