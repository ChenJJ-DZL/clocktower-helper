import { expect, type Page } from "@playwright/test";
import {
  SNAPSHOT_KEY,
  enterFirstNight,
  readSnapshot,
  waitForSnapshot,
} from "./scriptFlow";

/**
 * 🎯 定向场景驱动器（scenario runner）
 * ==================================================================
 * 「27 场矩阵」只证明**发牌与配比**正确（`e2e/full_sim/scenes.spec.ts`）；
 * 它不碰任何技能效果。本文件补的是下一层：
 *
 *   **用指定阵容开局 → 指定某一步选谁 → 断言该技能真的改了什么状态。**
 *
 * 与既有的 `fullSim.ts::advanceNightRandom` 的区别（不要混用）：
 *   · `advanceNightRandom` = **随机**选目标、跑整局、验 I0–I14 全局不变量；
 *   · 本文件 = **按剧本给的计划**点具体座位号，产出**逐步 journal**，
 *     供逐角色用例断言「这一步的弹窗内容 + 这一步落库的状态」。
 *
 * 两条设计红线
 * ------------------------------------------------------------------
 * ① **不做文案猜测**：当前行动者（actor seat / role）一律从**持久化快照**
 *    `wakeQueueIds[currentWakeIndex]` 读，不从页面文案推断。文案只作为
 *    「弹窗内容」被**记录**下来供断言，不作为驱动判据。
 * ② **不吞失败**：点不到/选不够时，把**当时的弹窗全文 + 按钮清单**记进
 *    journal 并返回 `"timeout"`，由用例判红 —— 不允许静默跳过。
 */

export interface SceneBoot {
  script: string;
  players: number;
  seed: number;
  /** 角色 id 数组，长度必须 === players */
  lineup: string[];
}

/** 一步夜间的留证（供断言：弹窗说了什么、实际点了谁、状态变成什么） */
export interface NightStep {
  /** 行动者座位（0 基） */
  seat: number;
  /** 行动者角色 id */
  role: string;
  /** 弹窗全文（已去空白） */
  dialog: string;
  /** 弹窗里的按钮文案 */
  buttons: string[];
  /** 实际点掉的座位号（1 基） */
  picked: number[];
  /** 点完之后的座位状态切片 */
  seats: Array<{
    id: number;
    role: string | null;
    dead: boolean;
    poisoned: boolean;
    drunk: boolean;
    marked: boolean;
    protected: boolean;
  }>;
  /** 点完之后的全局字段切片 */
  state: {
    phase: string | null;
    night: number | null;
    executed: number | null;
    wake: number[];
    wakeIndex: number | null;
  };
}

export interface NightReport {
  status: "day" | "gameover" | "timeout";
  steps: NightStep[];
  /** 卡死现场（`status==="timeout"` 时非空） */
  stuck?: { dialog: string | null; buttons: string[]; body: string };
}

/** 开局并停在首夜（「夜晚行动顺序」可见） */
export async function bootScene(page: Page, boot: SceneBoot): Promise<any> {
  await enterFirstNight(
    page,
    boot.players,
    boot.script,
    boot.seed,
    boot.lineup
  );
  const snap = await waitForSnapshot(
    page,
    (s) => Array.isArray(s?.seats) && s.seats.filter((x: any) => x.role).length === boot.players,
    20_000
  );
  expect(snap, "进入首夜后应写入持久化快照").toBeTruthy();
  return snap;
}

/** 按角色 id 找座位（0 基）。找不到直接抛错 —— 避免用例在错误阵容上跑出「假绿」 */
export function seatOf(snap: any, roleId: string, nth = 0): number {
  const hits = (snap?.seats ?? []).filter((s: any) => s.role?.id === roleId);
  if (hits.length <= nth) {
    throw new Error(
      `阵容里找不到第 ${nth + 1} 个【${roleId}】。实际阵容：` +
        (snap?.seats ?? []).map((s: any) => s.role?.id).join(",")
    );
  }
  return hits[nth].id as number;
}

/** 按座位号（0 基）取角色 id */
export function roleOf(snap: any, seatId: number): string | null {
  return (snap?.seats ?? []).find((s: any) => s.id === seatId)?.role?.id ?? null;
}

/** 座位号（1 基）→ 0 基 */
export const s = (oneBased: number): number => oneBased - 1;

export interface NightPick {
  /** 角色 id；同一角色有多个时按出现顺序对号（用 role + nth 精确指） */
  role: string;
  /** 同角色多人时取第几个（默认 0） */
  nth?: number;
  /** 要点的座位号（**1 基**，与 UI 一致），按顺序点 */
  targets?: number[];
  /** 角色选择器（洗脑师/哲学家等）里点哪个角色 id；不传则点第一个可选 */
  roleChoice?: string;
  /**
   * 说书人修正类弹窗（如「镇长替死判定」）里要点的座位号（**1 基**）。
   * 例：点镇长本人 = 不转移，按正常死亡结算；点别人 = 让别人替死。
   */
  substitute?: number;
  /** 仅记录，便于断言时认出这一步 */
  note?: string;
}

/**
 * 跑完一夜（或到 `stopBefore` 指定的角色步骤为止），逐步留证。
 *
 * 驱动规则（对应 UI 上真实要做的事）：
 *   1. 有目标选择弹窗 → 按 `targets` 点座位；没给 targets 则点前 N 个可用座位；
 *   2. 有角色选择器 → 按 `roleChoice` 点角色胶囊；没给则点第一个可用；
 *   3. 其他弹窗 → 点确认类按钮；
 *   4. 无弹窗 → 点主推进按钮（含间谍的「展开对局记录 / 我已查看完毕」）。
 *
 * @param stopBefore 走到这个角色**之前**就停（用于「只验某一步之前的状态」）
 */
export async function driveNight(
  page: Page,
  picks: NightPick[],
  opts: { maxSteps?: number; stopBefore?: string } = {}
): Promise<NightReport> {
  const maxSteps = opts.maxSteps ?? 400;
  return (await page.evaluate(
    async ({ picks, maxSteps, stopBefore, SNAPSHOT_KEY }) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const norm = (el: any) =>
        ((el?.textContent as string) || "").replace(/\s+/g, "");
      const btnsIn = (root: any) =>
        Array.from(root.querySelectorAll("button")) as any[];
      const bodyText = () => document.body.textContent || "";
      const isDay = () => /第\s*\d+\s*天/.test(bodyText());
      const CONFIRM = /确认选择|执行处决|确认|继续|下一步|确定|知道了|完成了/;
      /**
       * 点完**等页面签名变化**再返回（替代「点击后盲等固定毫秒」）。
       * 盲等会在 React 慢一档时拿到旧 DOM，也会被 `e2e_wait_pattern_guard` 判红。
       */
      const clickSettled = async (el: any, maxMs = 600) => {
        const sig = () =>
          `${document.querySelectorAll("button").length}|${
            (document.querySelector('[role="dialog"]')?.textContent ?? "").length
          }`;
        const before = sig();
        el.click();
        const t0 = Date.now();
        while (Date.now() - t0 < maxMs) {
          await sleep(25);
          if (sig() !== before) return;
        }
      };

      const snapNow = (): any => {
        try {
          const raw = window.localStorage.getItem(SNAPSHOT_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      };
      const slice = (snap: any) => ({
        seats: (snap?.seats ?? []).map((x: any) => ({
          id: x.id,
          role: x.role?.id ?? null,
          dead: x.isDead === true,
          poisoned: x.isPoisoned === true,
          drunk: x.isDrunk === true,
          marked: x.markedForDeath === true,
          protected: x.isProtected === true,
        })),
        state: {
          phase: snap?.gamePhase ?? null,
          night: snap?.nightCount ?? null,
          executed: snap?.executedPlayerId ?? null,
          wake: Array.isArray(snap?.wakeQueueIds) ? snap.wakeQueueIds : [],
          wakeIndex: typeof snap?.currentWakeIndex === "number" ? snap.currentWakeIndex : null,
        },
      });

      /** 当前行动者：只认快照真值 */
      const actor = (snap: any): { seat: number; role: string } | null => {
        const q = snap?.wakeQueueIds;
        const i = snap?.currentWakeIndex;
        if (!Array.isArray(q) || typeof i !== "number") return null;
        const seat = q[i];
        if (typeof seat !== "number") return null;
        const role = (snap?.seats ?? []).find((x: any) => x.id === seat)?.role?.id;
        return role ? { seat, role } : null;
      };

      const pickFor = (role: string): any => {
        // 同角色多人时按「第几个」匹配；这里用已消耗计数实现
        const candidates = picks.filter((p: any) => p.role === role);
        if (candidates.length === 0) return null;
        const used = (pickFor as any)._used ?? ((pickFor as any)._used = new Map());
        const n = used.get(role) ?? 0;
        used.set(role, n + 1);
        return candidates[Math.min(n, candidates.length - 1)];
      };

      const steps: any[] = [];
      let lastKey = "";
      let stall = 0;
      const gameEnded = () =>
        btnsIn(document).some((b) => /查看获胜结果/.test(norm(b)));

      for (let i = 0; i < maxSteps; i++) {
        const snap = snapNow();
        const act = actor(snap);

        if (stopBefore && act?.role === stopBefore) {
          return { status: "day", steps, stoppedBefore: stopBefore };
        }
        if (gameEnded()) return { status: "gameover", steps };
        if (isDay() && !document.querySelector('[role="dialog"]')) {
          return { status: "day", steps };
        }

        const dlg = document.querySelector('[role="dialog"]') as HTMLElement | null;
        const dlgKey = dlg ? norm(dlg).slice(0, 120) : "";
        if (dlgKey && dlgKey === lastKey) {
          stall++;
          if (stall > 60) {
            return {
              status: "timeout",
              steps,
              stuck: {
                dialog: dlg ? norm(dlg).slice(0, 600) : null,
                buttons: btnsIn(dlg).map((b) => norm(b).slice(0, 24)),
                body: bodyText().replace(/\s+/g, "").slice(0, 600),
              },
            };
          }
        } else {
          stall = 0;
          lastKey = dlgKey;
        }

        const pick = act ? pickFor(act.role) : null;
        const picked: number[] = [];

        if (dlg) {
          const hint = norm(dlg);

          // ① 角色选择器（洗脑师 / 哲学家 / 奥乔 …）
          const roleGrid =
            dlg.querySelector('[data-testid="cerenovus-role-grid"]') ?? null;
          const roleCaps = roleGrid
            ? Array.from(roleGrid.querySelectorAll("button[data-role-id]"))
            : Array.from(dlg.querySelectorAll("button[data-role-id]"));
          if (roleCaps.length > 0) {
            const want = pick?.roleChoice
              ? roleCaps.find((b: any) => b.getAttribute("data-role-id") === pick.roleChoice && !b.disabled)
              : null;
            const chosen =
              want ??
              roleCaps.find(
                (b: any) => b.getAttribute("data-selected") !== "true" && !b.disabled
              ) ??
              roleCaps[0];
            if (chosen) {
              await clickSettled(chosen, 300);
            }
          }

          // ② 目标选择网格
          //   ⚠️ 文案有两种：普通角色「请选择目标玩家（最少 N 人）」、
          //   说书人修正类「请选择1名目标玩家」（如镇长替死判定）——
          //   旧正则 `/请选择目标玩家/` 漏了后者 ⇒ 选不到目标 ⇒ 死循环到 timeout。
          if (/请选择(?:\d+\s*名)?目标玩家/.test(hint)) {
            const m = hint.match(/最少(\d+)人/);
            const need = m ? Number(m[1]) : 1;
            const cards = btnsIn(dlg).filter((b: any) =>
              /^\d+号/.test(norm(b))
            );
            const wanted = Array.isArray(pick?.substitute)
              ? [pick.substitute]
              : Array.isArray(pick?.targets)
                ? pick.targets
                : // 没给计划 → 取前 N 个可用（跳过「自己」）
                  [];
            for (const t of wanted) {
              const card = cards.find((c: any) =>
                norm(c).startsWith(`${t}号`)
              );
              if (card && !card.disabled) {
                card.click();
                picked.push(t);
                await sleep(25);
              }
            }
            if (wanted.length === 0 && need > 0) {
              let got = 0;
              for (const c of cards) {
                if (got >= need) break;
                if (/\(自己\)/.test(norm(c)) || c.disabled) continue;
                c.click();
                picked.push(Number((norm(c).match(/^(\d+)号/) ?? [])[1] ?? 0));
                got++;
                await sleep(25);
              }
            }
          }

          // 「确认替死/击杀目标」等说书人修正按钮优先
          const ok =
            btnsIn(dlg).find((b: any) => /确认替死|确认选择|确认击杀/.test(norm(b)) && !b.disabled) ??
            btnsIn(dlg).find((b: any) => CONFIRM.test(norm(b)) && !b.disabled) ??
            btnsIn(dlg).find((b: any) => !b.disabled);
          if (ok) {
            // ⚠️ 记录这一次「弹窗 + 选择 + 结果」，作为该步的留证
            const before = slice(snapNow());
            await clickSettled(ok, 500);
            const after = snapNow();
            if (act) {
              steps.push({
                seat: act.seat,
                role: act.role,
                note: pick?.note ?? null,
                dialog: hint.slice(0, 600),
                buttons: btnsIn(dlg).map((b: any) => norm(b).slice(0, 24)),
                picked,
                seats: slice(after).seats,
                state: slice(after).state,
                beforeState: before.state,
              });
            }
            continue;
          }
        }

        // ③ 无弹窗：主推进按钮
        const next = btnsIn(document).find(
          (b: any) =>
            /确认&下一步|下一步|天亮了|展开对局记录|我已查看完毕/.test(norm(b)) &&
            !b.disabled
        );
        if (next) {
          await clickSettled(next, 500);
          continue;
        }
        await sleep(40);
      }
      return {
        status: "timeout",
        steps,
        stuck: {
          dialog: null,
          buttons: btnsIn(document).map((b) => norm(b).slice(0, 24)),
          body: bodyText().replace(/\s+/g, "").slice(0, 600),
        },
      };
    },
    { picks, maxSteps, stopBefore: opts.stopBefore ?? null, SNAPSHOT_KEY }
  )) as NightReport;
}

/** 取 journal 里某个角色的所有步骤 */
export function stepsOf(report: NightReport, role: string): NightStep[] {
  return report.steps.filter((x) => x.role === role);
}

/** 取 journal 里某一步的座位状态切片 */
export function seatIn(
  step: NightStep | undefined,
  seatId: number
): NightStep["seats"][number] | null {
  if (!step) return null;
  return step.seats.find((x) => x.id === seatId) ?? null;
}

/** 断言 report 成功推进到白天（失败时把卡死现场贴出来） */
export function expectDay(report: NightReport, hint: string): void {
  if (report.status !== "day") {
    throw new Error(
      `${hint}：夜间未推进到白天（status=${report.status}）。` +
        `卡死现场=${JSON.stringify(report.stuck ?? null)}`
    );
  }
}

/** 读当前快照的简版（用例里断言用，不关心全量字段） */
export async function readSeatsNow(page: Page): Promise<any[]> {
  const snap = await readSnapshot(page);
  return snap?.seats ?? [];
}

// ═══════════════════════════════════════════════════════════════════════
// 🌆 定向黄昏 / 处决
// ═══════════════════════════════════════════════════════════════════════

export interface DuskPlan {
  /** 提名者座位号（1 基）；与 nominee 同时省略 = 不提名，直接入夜 */
  nominator?: number;
  nominee?: number;
  /** 投票者座位号（1 基）；省略 = 所有在场且可投的座位都投 */
  voters?: number[];
  /** 判定类弹窗（圣徒/市长等）选哪一项：`noop`（无事发生，默认）| `execute` */
  decision?: "noop" | "execute";
}

export interface DuskReport {
  status: "night" | "gameover" | "timeout";
  /** 提名是否真的发起成功（点到了「确认发起提名」） */
  nominated: boolean;
  /** 处决结算是否真的执行过 */
  executed: boolean;
  /** 处决过程中出现过的弹窗全文（按出现顺序） */
  dialogs: string[];
  /** 被处决座位（1 基，从「【N号被处决】」解析） */
  executedSeat: number | null;
  /** 结算前 / 后的死亡座位（0 基） */
  deadBefore: number[] | null;
  deadAfter: number[] | null;
  /** 是否已终局（`查看获胜结果` 出现） */
  gameover: boolean;
  stuck?: { buttons: string[]; body: string };
}

const SNAP_KEY = SNAPSHOT_KEY;

/**
 * 走一遍黄昏：可选**定向提名**（谁提名谁）+ 定向投票 + 处决结算 + 入夜。
 *
 * 与 `fullSim.ts::driveDuskRandom` 的分工：那个是随机压测，本函数**按计划**执行，
 * 供「贞洁者要求镇民提名」「猎手白天开枪」这类**必须指定座位**的用例使用。
 *
 * @returns 处方决留痕（`executedSeat` / `deadBefore` / `deadAfter` / `dialogs`）
 */
export async function driveDusk(page: Page, plan: DuskPlan = {}): Promise<DuskReport> {
  return (await page.evaluate(
    async ({ plan, SNAP_KEY }) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const norm = (el: any) => ((el?.textContent as string) || "").replace(/\s+/g, "");
      const allBtns = () => Array.from(document.querySelectorAll("button")) as any[];
      const text = () => document.body.textContent || "";
      const CONFIRM = /确认|提交|确定|继续|下一步|完成了|知道了|好的|通过/;

      const snapNow = (): any => {
        try {
          const raw = window.localStorage.getItem(SNAP_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      };
      const deadIds = (): number[] | null => {
        const snap = snapNow();
        if (!snap?.seats) return null;
        return snap.seats.filter((x: any) => x.isDead === true).map((x: any) => x.id);
      };
      const phaseNow = (): string | null => snapNow()?.gamePhase ?? null;
      const gameEnded = () =>
        allBtns().some((b) => /查看获胜结果/.test(norm(b)));

      const clickSettled = async (el: any, maxMs = 600) => {
        const sig = () =>
          `${document.body.innerHTML.length}|${document.querySelectorAll("button").length}`;
        const before = sig();
        el.click();
        const t0 = Date.now();
        while (Date.now() - t0 < maxMs) {
          await sleep(25);
          if (sig() !== before) return true;
        }
        return false;
      };

      const dialogs: string[] = [];
      /** 清空当前弹窗（判定类按 plan.decision 选，其余点确认） */
      const drainDialogs = async (max = 12): Promise<void> => {
        for (let k = 0; k < max; k++) {
          const dlg = document.querySelector('[role="dialog"]') as HTMLElement | null;
          if (!dlg) return;
          const t = norm(dlg);
          if (t) dialogs.push(t.slice(0, 600));
          const btns = Array.from(dlg.querySelectorAll("button")) as any[];
          const decision = btns.filter(
            (b) => /无事发生|执行处决|是，|否，/.test(norm(b)) && !b.disabled
          );
          if (decision.length > 0 && /判定|疯狂|仲裁|处决确认|是否/.test(t)) {
            const want =
              plan.decision === "execute"
                ? decision.find((b) => /执行处决|是，|^是/.test(norm(b)))
                : decision.find((b) => /无事发生|否，|^否/.test(norm(b)));
            const chosen = want ?? decision[0];
            await clickSettled(chosen, 400);
            continue;
          }
          const ok =
            btns.find((b) => CONFIRM.test(norm(b)) && !b.disabled && !/取消|返回/.test(norm(b))) ??
            btns.find((b) => !b.disabled && !/取消|返回/.test(norm(b)));
          if (!ok) return;
          await clickSettled(ok, 350);
        }
      };

      // ── 0：日间门禁（进入黄昏被禁用时先解除）──
      for (let g = 0; g < 10; g++) {
        const duskBtn = allBtns().find((b) => /进入黄昏/.test(norm(b)));
        if (!duskBtn || duskBtn.disabled === false) break;
        const cand = allBtns().filter(
          (b) =>
            !b.disabled &&
            !/^需先完成|^请先|^待完成/.test(norm(b)) &&
            /疯狂|判定|^(使用|发动|进行)/.test(norm(b))
        );
        if (cand.length === 0) break;
        await clickSettled(cand[0], 500);
        await drainDialogs(10);
      }
      if (gameEnded()) {
        return {
          status: "gameover", nominated: false, executed: false, dialogs,
          executedSeat: null, deadBefore: deadIds(), deadAfter: deadIds(), gameover: true,
        } as any;
      }

      // ── 1：进入黄昏 ──
      for (let i = 0; i < 8; i++) {
        const btn = allBtns().find((b) => /进入黄昏/.test(norm(b)) && !b.disabled);
        if (!btn) break;
        await clickSettled(btn, 700);
      }

      // ── 2：定向提名 ──
      let nominated = false;
      if (plan.nominator && plan.nominee) {
        const seatBtn = (n: number) =>
          allBtns().find(
            (b) => norm(b) === String(n) && !b.disabled && (b as any).offsetParent
          );
        const nb = seatBtn(plan.nominator);
        const vb = seatBtn(plan.nominee);
        if (nb && vb) {
          await clickSettled(nb, 350);
          await clickSettled(vb, 350);
          const go = allBtns().find(
            (b) => /确认发起提名/.test(norm(b)) && !b.disabled
          );
          if (go) {
            await clickSettled(go, 800);
            nominated = true;
            await sleep(400);
          }
        }
      }

      // ── 3：投票 / 处决 ──
      let executed = false;
      let deadBefore: number[] | null = null;
      let executedSeat: number | null = null;
      const wantVoters = Array.isArray(plan.voters) ? plan.voters : null;

      for (let i = 0; i < 120; i++) {
        if (gameEnded()) break;
        const dlg = document.querySelector('[role="dialog"]') as HTMLElement | null;
        if (dlg) {
          const t = norm(dlg);
          if (t) dialogs.push(t.slice(0, 600));
          const btns = Array.from(dlg.querySelectorAll("button")) as any[];

          // 举手表决计票：按计划勾人
          if (/举手表决计票|投票/.test(t)) {
            const voters = btns.filter(
              (b) => /^\d+号/.test(norm(b)) && !b.disabled
            );
            const chosen = wantVoters
              ? voters.filter((b) =>
                  wantVoters.some((v) => norm(b).startsWith(`${v}号`))
                )
              : voters;
            for (const v of chosen) await clickSettled(v, 40);
            const ok =
              btns.find((b) => /确认（|确认\(/.test(norm(b)) && !b.disabled) ??
              btns.find((b) => /^确认/.test(norm(b)) && !b.disabled);
            if (ok) await clickSettled(ok, 700);
            continue;
          }

          // 处决判定（圣徒/市长/免死类）
          const decision = btns.filter(
            (b) => /无事发生|执行处决|是，|否，/.test(norm(b)) && !b.disabled
          );
          if (decision.length > 0 && /判定|疯狂|仲裁|处决|是否/.test(t)) {
            const want =
              plan.decision === "execute"
                ? decision.find((b) => /执行处决|是，|^是/.test(norm(b)))
                : decision.find((b) => /无事发生|否，|^否/.test(norm(b)));
            await clickSettled(want ?? decision[0], 500);
            continue;
          }

          const ok =
            btns.find((b) => CONFIRM.test(norm(b)) && !b.disabled && !/取消|返回/.test(norm(b))) ??
            btns.find((b) => !b.disabled && !/取消|返回/.test(norm(b)));
          if (ok) {
            await clickSettled(ok, 350);
            continue;
          }
        }

        // 处决结算入口
        const settle = allBtns().find(
          (b) => /执行处决结算/.test(norm(b)) && !b.disabled
        );
        if (settle) {
          if (!executed) deadBefore = deadIds();
          executed = true;
          await clickSettled(settle, 800);
          await drainDialogs(10);
          const m = dialogs.join("|").match(/【(\d+)号被处决】/);
          if (m) executedSeat = Number(m[1]);
          continue;
        }

        // 入夜
        const toNight = allBtns().find((b) => /入夜/.test(norm(b)) && !b.disabled);
        if (toNight) {
          await clickSettled(toNight, 900);
          await drainDialogs(8);
          const ph = phaseNow();
          if (gameEnded()) break;
          if (ph && /night|firstNight|twilight/i.test(ph)) break;
          const still = allBtns().some((b) => /入夜/.test(norm(b)) && !b.disabled);
          if (!still) break;
          continue;
        }
        await sleep(200);
      }

      const status: any = gameEnded()
        ? "gameover"
        : /night|firstNight|twilight/i.test(phaseNow() ?? "") ||
            /夜晚行动顺序/.test(text())
          ? "night"
          : "timeout";

      return {
        status,
        nominated,
        executed,
        dialogs,
        executedSeat,
        deadBefore,
        deadAfter: deadIds(),
        gameover: gameEnded(),
        stuck:
          status === "timeout"
            ? {
                buttons: allBtns().map((b) => norm(b).slice(0, 24)),
                body: text().replace(/\s+/g, "").slice(0, 500),
              }
            : undefined,
      } as any;
    },
    { plan, SNAP_KEY }
  )) as DuskReport;
}
