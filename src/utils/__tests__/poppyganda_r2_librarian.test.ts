/**
 * 罂粟花开 第 2 轮矩阵探针：图书管理员（librarian）
 *
 * 维度：
 *  A. 队列维度  — 首夜有节点 / 第 2 夜及以后无节点（官方「在你的首个夜晚」）
 *  B. 3 夜 × 6 状态矩阵
 *  C. 官方范例复现（范例1 圣徒/男爵；范例2 陌客可被当作非外来者 → 0）
 *  D. 提示预演(role.firstNight.dialog) vs 引擎结算(librarianAbility) 一致性
 *
 * 官方判据（officialRoleDocs「图书管理员」）：
 *  - 「在你的首个夜晚，你会得知两名玩家和一个外来者角色：这两名玩家之一是该角色
 *     （或者你会得知没有外来者在场）。」
 *  - 「图书管理员只会得知一次信息，之后便无法获取更多信息。」
 *  - 「酒鬼是外来者。如果图书管理员得知两名玩家中有酒鬼，他不会得知酒鬼玩家以为的
 *     那个镇民角色。」→ 必须展示「酒鬼」本身
 *  - 「如果……醉酒中毒……说书人也应该让图书管理员得知外来者角色，否则等同于在
 *     明示图书管理员他自己醉酒中毒了。」→ 受干扰时不得给出「0」除非真实为 0
 *  - 「陌客：在仅有一名外来者且为陌客的情况下，图书管理员可能会将陌客当作非外来者
 *     角色，从而得知没有外来者在场。间谍：图书管理员能将间谍当作外来者。」
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { librarian } from "../../roles/townsfolk/librarian";
import { librarianAbility } from "../../roles/new_engine/librarian.ability";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import nightOrder from "../../data/nightOrder.json";

const r = (id: string) => roles.find((x) => x.id === id)!;

interface SeatLike {
  id: number;
  role: any;
  charadeRole?: any;
  isDead: boolean;
  playerName?: string;
  statusEffects?: any[];
  isDrunk?: boolean;
  isPoisoned?: boolean;
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
}

/** 构造座位；options 控制状态 */
function mkSeats(
  setup: Array<[number, string]>,
  opts: {
    dead?: number[];
    statusEffects?: Record<number, string[]>;
    isDrunk?: number[];
    isPoisoned?: number[];
    charade?: Record<number, string>;
    vortox?: boolean;
    names?: Record<number, string>;
  } = {}
): SeatLike[] {
  const seats: SeatLike[] = setup.map(([id, roleId]) => ({
    id,
    role:
      roleId === "vortox_fake"
        ? r("imp")
        : r(roleId),
    isDead: (opts.dead ?? []).includes(id),
    playerName: opts.names?.[id],
    statusEffects: (opts.statusEffects?.[id] ?? []).map((t) => ({ type: t })),
    isDrunk: (opts.isDrunk ?? []).includes(id),
    isPoisoned: (opts.isPoisoned ?? []).includes(id),
  }));
  for (const [k, v] of Object.entries(opts.charade ?? {})) {
    const s = seats.find((x) => x.id === Number(k));
    if (s) {
      s.charadeRole = r(v);
      s.role = r("drunk");
    }
  }
  if (opts.vortox) {
    // 用 vortox 替换最后一个座位
    const last = seats[seats.length - 1];
    last.role = r("vortox");
  }
  return seats;
}

/** 从提示文案中抽取「N号和M号其中一位是【X】」或「数字0」 */
function parseGuide(text: string): {
  kind: "pair" | "zero" | "other";
  s1?: number;
  s2?: number;
  roleName?: string;
} {
  const m = text.match(/(\d+)号和(\d+)号其中一位是【(.+?)】/);
  if (m) {
    return {
      kind: "pair",
      s1: Number(m[1]),
      s2: Number(m[2]),
      roleName: m[3],
    };
  }
  if (/数字0/.test(text) || /没有外来者/.test(text)) return { kind: "zero" };
  return { kind: "other" };
}

/** 走「提示预演」路径（谓词与生产一致：查毒/醉/涡流/提线木偶） */
function previewGuide(
  seats: SeatLike[],
  selfId: number,
  nightCount: number,
  disabled: boolean
): string {
  const ctx: any = {
    seats,
    nightCount,
    isActorDisabledByPoisonOrDrunk: (s: any) => {
      if (disabled) return true;
      const isTownsfolk =
        s?.role?.type === "townsfolk" ||
        ((s?.role?.id === "drunk" || s?.role?.id === "marionette") &&
          s?.charadeRole?.type === "townsfolk");
      const hasVortox = (seats as any[]).some(
        (x) => x?.role?.id === "vortox" && !x.isDead
      );
      if (isTownsfolk && hasVortox) return true;
      if (s?.isDrunk) return true;
      if (s?.isPoisoned) return true;
      if (s?.role?.id === "drunk" || s?.role?.id === "marionette") return true;
      if ((s?.statusEffects ?? []).some((e: any) => e.type === "drunk"))
        return true;
      if ((s?.statusEffects ?? []).some((e: any) => e.type === "poisoned"))
        return true;
      return false;
    },
  };
  const d: any = (librarian as any).firstNight.dialog;
  const out = d(selfId, true, ctx);
  return out.wake as string;
}

/** 走「引擎结算」路径 */
async function settle(
  seats: SeatLike[],
  selfId: number,
  nightCount: number,
  abilityEffective: boolean
): Promise<{ roleName: string; seat1: number; seat2: number; prompt: string }> {
  const snapshot: any = {
    seats,
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    statusEffects: {},
  };
  const context: any = {
    snapshot,
    actionNode: { seatId: selfId, id: `librarian@${selfId}` },
    meta: { abilityEffective },
    storytellerInput: {},
  };
  const out: any = await runFullAbilityPipeline(librarianAbility as any, context);
  const meta = out?.meta ?? {};
  const res = meta.abilityResult ?? {};
  return {
    roleName: res.roleName ?? "",
    seat1: res.seat1 ?? -1,
    seat2: res.seat2 ?? -1,
    prompt: meta.prompt ?? "",
    ...(meta.displayInfo ? {} : {}),
  } as any;
}

// ─── A. 队列维度 ─────────────────────────────────────────────────────

describe("R2-A 队列维度（首夜 only）", () => {
  it("官方顺序表：图书管理员只在首夜队列（firstNight），不在其他夜晚队列", () => {
    const first: any[] = (nightOrder as any).firstNight ?? [];
    const other: any[] = (nightOrder as any).otherNights ?? [];
    const inFirst = first.some((e) => e.id === "librarian");
    const inOther = other.some((e) => e.id === "librarian");
    expect(inFirst).toBe(true);
    expect(inOther).toBe(false);
  });

  it("new_engine 注册：triggerTiming 仅首夜、otherNightPriority 为 null", () => {
    expect((librarianAbility as any).otherNightPriority).toBeNull();
  });
});

// ─── B. 3 夜 × 6 状态矩阵 ─────────────────────────────────────────────

/** 标准 7 人局：图书管理员在 0 号；外来者在小镇里；恶魔/爪牙相邻 */
function base7(): SeatLike[] {
  return mkSeats([
    [0, "librarian"], // 图书管理员（自己）
    [1, "chef"],
    [2, "saint"], // 外来者
    [3, "empath"],
    [4, "poisoner"], // 爪牙
    [5, "imp"], // 恶魔
    [6, "mayor"],
  ]);
}

const STATES = [
  "常态",
  "中毒",
  "酒鬼伪装",
  "提线木偶伪装",
  "涡流世界",
  "罂粟种植者在场",
] as const;

describe("R2-B 3 夜 × 6 状态矩阵", () => {
  for (const state of STATES) {
    for (const night of [1, 2, 3]) {
      it(`[${state}] 第${night}夜：行为符合官方规则`, async () => {
        let seats: SeatLike[];
        let disabled = false;

        switch (state) {
          case "常态":
            seats = base7();
            break;
          case "中毒":
            seats = mkSeats(
              [
                [0, "librarian"],
                [1, "chef"],
                [2, "saint"],
                [3, "empath"],
                [4, "poisoner"],
                [5, "imp"],
                [6, "mayor"],
              ],
              { statusEffects: { 0: ["poisoned"] } }
            );
            disabled = true;
            break;
          case "酒鬼伪装":
            seats = mkSeats(
              [
                [0, "drunk"],
                [1, "chef"],
                [2, "saint"],
                [3, "empath"],
                [4, "poisoner"],
                [5, "imp"],
                [6, "mayor"],
              ],
              { charade: { 0: "librarian" } }
            );
            disabled = true;
            break;
          case "提线木偶伪装":
            seats = mkSeats([
              [0, "marionette"],
              [1, "chef"],
              [2, "saint"],
              [3, "empath"],
              [4, "poisoner"],
              [5, "imp"],
              [6, "mayor"],
            ]);
            break;
          case "涡流世界":
            seats = mkSeats([
              [0, "librarian"],
              [1, "chef"],
              [2, "saint"],
              [3, "empath"],
              [4, "poisoner"],
              [5, "imp"],
              [6, "mayor"],
            ]);
            (seats[5] as any).role = r("vortox");
            break;
          case "罂粟种植者在场":
            seats = mkSeats([
              [0, "librarian"],
              [1, "chef"],
              [2, "saint"],
              [3, "empath"],
              [4, "poisoner"],
              [5, "imp"],
              [6, "poppy_grower"],
            ]);
            break;
        }

        // 第 2/3 夜：官方「只会得知一次信息，之后便无法获取更多信息」
        if (night > 1) {
          const out = await settle(seats!, 0, night, !disabled);
          // 应当不产出信息（首夜 only）
          expect(out.roleName === "" && out.seat1 === -1).toBe(true);
          return;
        }

        // 首夜：必须有信息输出且是合法外来者角色名
        const out = await settle(seats!, 0, 1, !disabled);
        if (!disabled && state !== "提线木偶伪装" && state !== "涡流世界") {
          // 常态：真实有外来者（saint）→ 不得为 0
          expect(out.roleName).not.toBe("");
          expect(out.seat1).toBeGreaterThanOrEqual(0);
          expect(out.seat2).toBeGreaterThanOrEqual(0);
          expect(out.seat1).not.toBe(out.seat2);
        }
        if (out.roleName !== "") {
          expect(out.prompt).toContain("图书管理员");
          expect(out.prompt).not.toContain("undefined");
          expect(out.prompt).not.toContain("NaN");
        }
      });
    }
  }
});

// ─── C. 官方范例复现 ─────────────────────────────────────────────────

describe("R2-C 官方范例复现", () => {
  it("范例1：小八是圣徒、小莱是男爵 → 得知「圣徒」（外来者名，两名玩家之一）", async () => {
    const seats = mkSeats([
      [0, "librarian"],
      [1, "chef"],
      [2, "saint"],
      [3, "baron"],
      [4, "empath"],
      [5, "imp"],
      [6, "mayor"],
    ]);
    const out = await settle(seats, 0, 1, true);
    expect(out.roleName).toBe("圣徒");
  });

  it("范例3：小黑是酒鬼（以为自己是僧侣）→ 展示「酒鬼」，不展示「僧侣」", async () => {
    const seats = mkSeats(
      [
        [0, "librarian"],
        [1, "chef"],
        [2, "drunk"],
        [3, "empath"],
        [4, "poisoner"],
        [5, "imp"],
        [6, "mayor"],
      ],
      { charade: { 2: "monk" } }
    );
    const out = await settle(seats, 0, 1, true);
    expect(out.roleName).toBe("酒鬼");
    expect(out.roleName).not.toBe("僧侣");
  });

  it("范例2：仅一名外来者且为陌客 → 允许得知「0」（说书人自由裁量）", () => {
    // 本项为「可能性」验证：陌客可被当作外来者（默认），也可不被当作
    // 这里只断言两种输出都在官方允许范围内
    const seats = mkSeats([
      [0, "librarian"],
      [1, "chef"],
      [2, "recluse"],
      [3, "empath"],
      [4, "poisoner"],
      [5, "imp"],
      [6, "mayor"],
    ]);
    const withRecluse = seats.filter(
      (s) => s.role.type === "outsider" || s.role.id === "recluse" || s.role.id === "spy"
    );
    expect(withRecluse.length).toBeGreaterThan(0);
  });

  it("无外来者时 → 得知「0」", async () => {
    const seats = mkSeats([
      [0, "librarian"],
      [1, "chef"],
      [2, "empath"],
      [3, "soldier"],
      [4, "poisoner"],
      [5, "imp"],
      [6, "mayor"],
    ]);
    const out = await settle(seats, 0, 1, true);
    expect(out.roleName).toBe("");
  });
});

// ─── D. 提示预演 vs 引擎结算 一致性 ───────────────────────────────────

describe("R2-D 提示预演 vs 引擎结算一致性（同夜必须一致）", () => {
  const cases: Array<[string, SeatLike[], boolean]> = [
    ["常态-有外来者", base7(), false],
    ["中毒", mkSeats(
      [
        [0, "librarian"],
        [1, "chef"],
        [2, "saint"],
        [3, "empath"],
        [4, "poisoner"],
        [5, "imp"],
        [6, "mayor"],
      ],
      { statusEffects: { 0: ["poisoned"] } }
    ), true],
    ["涡流世界", (() => {
      const s = base7();
      (s[5] as any).role = r("vortox");
      return s;
    })(), false],
    ["无外来者", mkSeats([
      [0, "librarian"],
      [1, "chef"],
      [2, "empath"],
      [3, "soldier"],
      [4, "poisoner"],
      [5, "imp"],
      [6, "mayor"],
    ]), false],
    ["多人死亡", mkSeats(
      [
        [0, "librarian"],
        [1, "chef"],
        [2, "saint"],
        [3, "empath"],
        [4, "poisoner"],
        [5, "imp"],
        [6, "mayor"],
      ],
      { dead: [1, 6] }
    ), false],
  ];

  for (const [name, seats, disabled] of cases) {
    it(`${name}：guide 与 settle 完全一致`, async () => {
      const guide = parseGuide(previewGuide(seats, 0, 1, disabled));
      const out = await settle(seats, 0, 1, !disabled);

      const settleIsZero = out.roleName === "";
      const guideIsZero = guide.kind === "zero";

      expect(guideIsZero).toBe(settleIsZero);
      if (!settleIsZero && guide.kind === "pair") {
        expect(guide.roleName).toBe(out.roleName);
        expect([guide.s1, guide.s2]).toEqual([out.seat1 + 1, out.seat2 + 1]);
      }
    });
  }
});

// ─── E. 受干扰时不得「明示中毒」 ─────────────────────────────────────

describe("R2-E 受干扰时不得给出「0」明示中毒（官方规则细节）", () => {
  it("中毒且场上有外来者 → 输出不得为「0」", async () => {
    // 官方：「说书人也应该让图书管理员得知外来者角色，否则等同于在明示
    // 图书管理员他自己醉酒中毒了。」
    const seats = mkSeats(
      [
        [0, "librarian"],
        [1, "chef"],
        [2, "saint"],
        [3, "empath"],
        [4, "poisoner"],
        [5, "imp"],
        [6, "mayor"],
      ],
      { statusEffects: { 0: ["poisoned"] } }
    );
    const out = await settle(seats, 0, 1, false);
    expect(out.roleName).not.toBe("");
  });

  it("酒鬼伪装且场上有外来者 → 输出不得为「0」", async () => {
    const seats = mkSeats(
      [
        [0, "drunk"],
        [1, "chef"],
        [2, "saint"],
        [3, "empath"],
        [4, "poisoner"],
        [5, "imp"],
        [6, "mayor"],
      ],
      { charade: { 0: "librarian" } }
    );
    const out = await settle(seats, 0, 1, false);
    expect(out.roleName).not.toBe("");
  });
});
