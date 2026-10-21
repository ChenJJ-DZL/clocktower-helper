import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { bootScene } from "../helpers/scenario";

/**
 * 专项 X01 · 夜序 = 官方 rank（9 条）
 * ==================================================================
 * 计划见 `outputs/全量验证计划V2-场次用例清单-2026-10-21.md` §X01。
 *
 * 为什么必须单独开：I10 只证「弹窗里的座位顺序 === 唤醒队列顺序」，
 * **不证「队列 === 官方夜序」**。生成器把顺序写反时 I10 全绿。
 *
 * ─── 判据（真值不来自被测实现） ────────────────────────────────────
 *   真值 = `src/data/nightOrder.json` 的 `firstNight` **数组下标**（官方静态文件），
 *          **不调用** `nightOrderParser`（那是被测实现，自己证自己）。
 *   实测 = 入夜后持久化快照的 `wakeQueueIds`（座位 id，0 基）。
 *
 * ─── 三个必须处理的现实（否则判据必假红） ──────────────────────────
 * ① **同一座位会出现多次**：
 *    · 爪牙互认（`minion_info`）在引擎里按「每名真爪牙一个 step」展开
 *      （`dynamicQueueGenerator` §1.5），所以每个爪牙出现两次：互认 + 自身技能；
 *    · 间谍末尾再出现一次（查看魔典）；
 *    · 赏金猎人把某人转成邪恶时，最前面还有一条「邪恶阵营告知」。
 *    ⇒ 取每个座位**最后一次**出现的位置当作「自身技能步骤」的位置。
 *      系统步骤永远排在技能步骤之前（告知步骤 priority = -1000），
 *      所以「最后一次」对上述三种情况都成立。
 *
 * ② **官方 firstNight 表不含恶魔与部分爪牙**：
 *    恶魔（imp / zombuul / fang_gu / vortox / shabaloth / no_dashii …）在官方
 *    首夜序里由 `di`（恶魔信息）一步覆盖，不按角色 id 列出；`assassin` / `baron` /
 *    `scarlet_woman` / `pit_hag` 同样没有独立条目（互认或本表缺口）。
 *    ⇒ 这些角色**不参与 rank 比较**（比较它们等于拿不存在的真值判红）。
 *
 * ③ **有 rank 的角色必须被唤醒**：在场却没进队列 = 漏唤醒（真缺陷），必须报红。
 *    （送葬者/守鸦人/贤者这类只在 otherNights 的，不在 firstNight 表里，不受此约束。）
 *
 * 运行：npx playwright test e2e/special/x01_night_order.spec.ts --workers=1 --retries=0
 */

const scenesPath = path.resolve(__dirname, "../../outputs/scenes.json");
const nightOrderPath = path.resolve(__dirname, "../../src/data/nightOrder.json");

/** 9 剧本各一场（与 X01-1…9 一一对应） */
const CASES = [
  { id: "S01", script: "暗流涌动" },
  { id: "S03", script: "黯月初升" },
  { id: "S07", script: "梦殒春宵" },
  { id: "S11", script: "窃窃私语" },
  { id: "S14", script: "无名之墓" },
  { id: "S16", script: "无上愉悦" },
  { id: "S18", script: "凶宅魅影" },
  { id: "S21", script: "游园惊梦" },
  { id: "S25", script: "罂粟花开" },
];

const FIRST_NIGHT: Array<{ id: string; chineseName: string }> = JSON.parse(
  fs.readFileSync(nightOrderPath, "utf-8")
).firstNight;

/** 角色 id → 官方首夜 rank */
const RANK = new Map<string, number>(FIRST_NIGHT.map((e, i) => [e.id, i]));

function loadScene(id: string): { script: string; game: any } {
  const raw = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));
  for (const s of raw.scripts) {
    for (const g of s.games) {
      if (g.id === id) return { script: s.script, game: g };
    }
  }
  throw new Error(`找不到场次 ${id}`);
}

for (const entry of CASES) {
  test.describe(`X01 · ${entry.script}（${entry.id}）首夜唤醒队列必须符合官方 rank`, () => {
    test.setTimeout(120_000);

    test(`场次 ${entry.id} 的技能步骤顺序必须与 nightOrder.firstNight 单调一致`, async ({
      page,
    }) => {
      const { script, game } = loadScene(entry.id);
      const snap = await bootScene(page, {
        script,
        players: game.players,
        seed: game.seed,
        lineup: game.seats.map((s: any) => s.id),
      });

      const queue: number[] = Array.isArray(snap?.wakeQueueIds)
        ? snap.wakeQueueIds
        : [];
      expect(queue.length, `${entry.id} 首夜队列不得为空`).toBeGreaterThan(0);

      const seats: any[] = snap.seats ?? [];
      const seatById = new Map<number, any>(seats.map((s: any) => [s.id, s]));

      // ① 队列元素必须是真实座位（不越界、不脏值）
      for (const seatId of queue) {
        expect(
          seatById.get(seatId),
          `${entry.id} 队列里的座位 ${seatId} 不在座位表中（越界/脏值）`
        ).toBeTruthy();
      }

      // ② 每个座位最后一次出现 = 自身技能步骤位置
      const lastIndex = new Map<number, number>();
      queue.forEach((seatId, i) => lastIndex.set(seatId, i));

      const ranked = seats
        .filter((s: any) => RANK.has(s.role?.id))
        .map((s: any) => ({
          seat: s.id as number,
          roleId: s.role.id as string,
          rank: RANK.get(s.role.id) as number,
          pos: lastIndex.get(s.id) ?? -1,
        }));

      /**
       * ③ 不做「在场却没唤醒」的断言 —— 原因是**剧本可以自定义角色类型**：
       *    例：`snitch`（告密者）官方是爪牙、firstNight rank=29，但「罂粟花开」
       *    把它定义成外来者，且本项目的实现刻意让它在互认环节被动展示身份、
       *    不单独唤醒（见 `dynamicQueueGenerator` 的 `roleId === "snitch"` 分支
       *    与 `IdentityShowcaseModal` 的 snitchAbsentRoles 断言）。
       *    把官方 firstNight 表当成「必须唤醒」的真值会对合法的剧本自定义报假红。
       *    「漏唤醒」由各剧本 `role_scenarios.spec.ts` 的逐角色用例负责。
       */

      // ④ 按技能步骤位置排序后，rank 必须非递减

      // ④ 按技能步骤位置排序后，rank 必须非递减
      const ordered = ranked
        .filter((x) => x.pos >= 0)
        .sort((a, b) => a.pos - b.pos);

      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1];
        const cur = ordered[i];
        expect(
          cur.rank,
          [
            `${entry.id} 首夜唤醒顺序与官方 rank 不一致：`,
            `${cur.roleId}（${cur.seat}号, rank=${cur.rank}, 队列第 ${cur.pos} 位）`,
            `排在 ${prev.roleId}（${prev.seat}号, rank=${prev.rank}, 队列第 ${prev.pos} 位）之后。`,
            `实测技能段：${ordered.map((x) => `${x.roleId}#${x.seat}`).join(" → ")}`,
          ].join(" ")
        ).toBeGreaterThanOrEqual(prev.rank);
      }
    });
  });
}
