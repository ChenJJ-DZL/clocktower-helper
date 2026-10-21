import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { enterFirstNight, waitForSnapshot } from "../helpers/scriptFlow";

/**
 * 🧪 「27 场逐角色验证」的执行入口
 * ------------------------------------------------------------------
 * 本文件是 **「27 场逐角色验证」的执行入口**：把 `outputs/scenes.json` 里
 * 的每一场（9 个剧本 / 27 局）逐条跑完，验证两件事：
 *   1. **发牌正确**：强制注入的阵容（角色 id 数组）必须与实际发出的牌一致；
 *   2. **配比正确**：村民 / 外来者 / 爪牙 / 恶魔 四类数量必须与清单一致。
 *
 * 每场的阵容来自 `npm run plan:scenes`（`scripts/plan-scenes.ts`）生成的
 * `outputs/scenes.json`：该脚本不仅从 `app/data.ts` 抽取角色 id，还按
 * `STANDARD_COMPOSITIONS` + 角色自带修正（男爵 / 方古 / 亡骨魔）
 * **独立复算过配比** ⇒ 这里的 counts 断言是有依据的期望值，不是抄来的快照。
 *
 * 座位由「随机落座」决定，所以**不比座位号，只比角色集合**（多重集合相等）。
 *
 * 用法（需外部先起 dev server，端口 3100 —— 配置里刻意不用 webServer）：
 * ```
 * npx playwright test e2e/full_sim/scenes.spec.ts
 * ```
 * 地基 smoke（只跑 1 场）见同目录 `scene_forced.spec.ts`。
 */
type Seat = { id: string; name: string; type: string };

type Counts = {
  townsfolk: number;
  outsider: number;
  minion: number;
  demon: number;
};

type Game = {
  id: string;
  seed: number;
  players: number;
  counts: Counts;
  seats: Seat[];
};

type ScriptScenes = {
  script: string;
  games: Game[];
};

const scenesPath = path.resolve(__dirname, "../../outputs/scenes.json");

function loadScenes(): ScriptScenes[] {
  const raw = fs.readFileSync(scenesPath, "utf-8");
  const parsed = JSON.parse(raw) as { scripts?: ScriptScenes[] };
  if (!Array.isArray(parsed.scripts) || parsed.scripts.length === 0) {
    throw new Error(`scenes.json 解析不到 scripts：${scenesPath}`);
  }
  return parsed.scripts;
}

const scenes = loadScenes();

for (const scriptEntry of scenes) {
  test.describe(`场次矩阵 · ${scriptEntry.script}`, () => {
    // 串行：同一剧本内按场次顺序推进，避免共享 dev server 时的资源争抢
    test.describe.configure({ mode: "serial" });

    for (const game of scriptEntry.games) {
      test(`${game.id} · ${game.players}人 · seed=${game.seed} 发牌与配比正确`, async ({
        page,
      }) => {
        test.setTimeout(8 * 60 * 1000);

        const lineup = game.seats.map((s) => s.id);

        await enterFirstNight(
          page,
          game.players,
          scriptEntry.script,
          game.seed,
          lineup
        );

        const snap = await waitForSnapshot(
          page,
          (st) =>
            Array.isArray(st?.seats) &&
            st.seats.filter((x: any) => x.role).length === game.players,
          20_000
        );

        // 断言 1：进入首夜后应已写入持久化快照
        expect(snap?.seats, "进入首夜后应写入持久化快照").toBeTruthy();

        const seats = (snap?.seats ?? []) as any[];

        // 断言 2：发出的牌必须等于注入的牌（多重集合相等，不比座位号）
        const dealt = seats
          .filter((x) => x.role)
          .map((x) => String(x.role.id))
          .sort();
        expect(dealt, "发出的牌必须等于注入的牌").toEqual([...lineup].sort());

        // 断言 3：四类阵营的配比必须与清单一致
        const byType = (t: string) =>
          seats.filter((x: any) => x.role?.type === t).length;
        expect(byType("townsfolk"), "村民数量应与配比一致").toBe(
          game.counts.townsfolk
        );
        expect(byType("outsider"), "外来者数量应与配比一致").toBe(
          game.counts.outsider
        );
        expect(byType("minion"), "爪牙数量应与配比一致").toBe(
          game.counts.minion
        );
        expect(byType("demon"), "恶魔数量应与配比一致").toBe(
          game.counts.demon
        );
      });
    }
  });
}
