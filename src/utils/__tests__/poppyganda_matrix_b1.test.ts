import { describe, expect, it } from "vitest";
import { roles as allRoles, type Seat } from "../../../app/data";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";

/**
 * 罂粟花开「角色 × 状态」矩阵探针（第 1 批：镇民）
 * 目的：把 13 个镇民在 常态 / 中毒 下的夜间信息全部跑一遍，收集异常，不硬断言。
 * 判据：src/data/officialRoleDocs.json 原文 + 不变式 I1~I11。
 */
const SCRIPT = {
  id: "poppyganda",
  name: "罂粟花开",
  roleIds: [
    "librarian", "chef", "bounty_hunter", "pixie", "fortune_teller", "monk",
    "oracle", "town_crier", "juggler", "savant", "farmer", "mayor", "poppy_grower",
    "drunk", "lunatic", "mutant", "snitch",
    "cerenovus", "evil_twin", "baron", "marionette",
    "imp", "vortox", "legion",
  ],
} as any;

const TOWNSFOLK = [
  "librarian", "chef", "bounty_hunter", "pixie", "fortune_teller", "monk",
  "oracle", "town_crier", "juggler", "savant", "farmer", "mayor", "poppy_grower",
];

const r = (id: string) => {
  const x = allRoles.find((y) => y.id === id)!;
  return { id: x.id, name: x.name, type: x.type };
};

/** 9 人局：0 号 = 被测角色；1-4 镇民；5-6 外来者；7 爪牙；8 恶魔（默认小恶魔，涡流单独作为状态维度） */
function seatsFor(
  targetId: string,
  opts: { poisoned?: boolean; drunk?: boolean; demon?: string } = {}
) {
  const ids = [
    targetId, "chef", "mayor", "oracle", "monk",
    "drunk", "mutant", "cerenovus", opts.demon ?? "imp",
  ];
  return ids.map((id, i) => ({
    id: i,
    role: r(id),
    isDead: false,
    isDrunk: !!(opts.drunk && i === 0),
    isPoisoned: !!(opts.poisoned && i === 0),
  }));
}

const warnings: string[] = [];
const origWarn = console.warn;
const origError = console.error;

type Row = {
  role: string;
  state: string;
  isPoisoned: string;
  targetLimit: string;
  playerFacing: string;
  guide: string;
  flags: string;
};

const rows: Row[] = [];

function probe(roleId: string, stateName: string, opts: any, phase: "firstNight" | "night", nightCount: number) {
  warnings.length = 0;
  const seats = seatsFor(roleId, opts);
  let info: any = null;
  let err = "";
  try {
    info = calculateNightInfoViaNewEngine(SCRIPT, seats as any, 0, phase, null, nightCount);
  } catch (e: any) {
    err = String(e?.message ?? e);
  }
  const guide = String(info?.guide ?? "");
  const guideText = String(info?.guideText ?? "");
  const pf = String(info?.playerFacingGuide ?? "");
  const st = String(info?.storytellerNote ?? "");
  const flags: string[] = [];
  if (err) flags.push(`💥抛错:${err}`);
  if (!info) flags.push("⛔nightInfo=null");
  // ⚠️ 必须把 guide / guideText / playerFacingGuide 都纳入脏文案扫描：
  //    guide 给说书人看、playerFacingGuide 给玩家看，任一含占位符都是真缺陷。
  if (/undefined|NaN|\[object Object\]/.test(guide + guideText + pf))
    flags.push("⚠文案含 undefined/NaN/[object]");
  if (/undefined/.test(st)) flags.push("⚠备注含 undefined");
  if (warnings.length) flags.push(`🔔warn:${warnings.slice(0, 2).join(" ｜ ").slice(0, 110)}`);
  rows.push({
    role: roleId,
    state: stateName,
    isPoisoned: String(info?.isPoisoned),
    targetLimit: info?.targetLimit ? `${info.targetLimit.min}/${info.targetLimit.max}` : "—",
    playerFacing: pf ? (pf === guide ? "=guide" : pf.slice(0, 34)) : "—",
    guide: guide.replace(/\n/g, " ⏎ ").slice(0, 78),
    flags: flags.join(" "),
  });
}

const runAll = () => {
    warnings.length = 0;
    console.warn = (...a: any[]) => warnings.push(a.map(String).join(" "));
    console.error = () => {};
    try {
      for (const role of TOWNSFOLK) {
        probe(role, "①常态", {}, "firstNight", 1);
        probe(role, "②中毒", { poisoned: true }, "firstNight", 1);
        probe(role, "③酒鬼", { drunk: true }, "firstNight", 1);
        probe(role, "④涡流世界", { demon: "vortox" }, "firstNight", 1);
        probe(role, "⑤次夜常态", {}, "night", 2);
      }
    } finally {
      console.warn = origWarn;
      console.error = origError;
    }
};

const dumpTable = () => {
    console.log("\n══════ 罂粟花开 镇民矩阵 ══════");
    console.log(
      "角色".padEnd(15) + "状态".padEnd(11) + "isPois".padEnd(8) + "目标".padEnd(7) + "guide"
    );
    for (const row of rows) {
      console.log(
        row.role.padEnd(15) +
          row.state.padEnd(11) +
          row.isPoisoned.padEnd(8) +
          row.targetLimit.padEnd(7) +
          row.guide
      );
      if (row.flags) console.log("    ↳ 异常: " + row.flags);
    }
    const bad = rows.filter((x) => x.flags);
    console.log(`\n共 ${rows.length} 组；有异常标记 ${bad.length} 组`);
};

/**
 * ⚠️ 本文件原本是「零断言探针」（只 console.log，永远绿）——
 *    违反测试真实性铁律（假绿）。现改为**先跑全矩阵、再对整批硬断言**：
 *    任何一组出现「抛错 / nightInfo=null / 文案含 undefined|NaN|[object Object]」
 *    都必须让本文件变红，否则 65 组等于白跑。
 */
describe("罂粟花开 · 第1批 镇民矩阵（真断言）", () => {
  it("跑完 13 镇民 × 5 状态（65 组），全部不得崩溃/不得产出脏文案", () => {
    rows.length = 0;
    runAll();
    dumpTable();

    // ── 断言 1：矩阵必须跑满，不能"悄悄少跑" ──────────────────────
    expect(rows.length, "13 镇民 × 5 状态 = 65 组，实际 " + rows.length).toBe(
      TOWNSFOLK.length * 5
    );

    // ── 断言 2：不得有任何异常标记（这才是本矩阵的存在意义）──────
    const bad = rows.filter((x) => x.flags);
    expect(
      bad.map((b) => `${b.role}/${b.state}: ${b.flags}`),
      `${bad.length} 组出现异常（抛错 / nightInfo=null / 脏文案）`
    ).toEqual([]);

    // ── 断言 3：首夜「确实产出信息」的角色，guide 必须非空 ────────
    // ⚠️ 不能一刀切断言"所有角色 guide 非空"——下列角色**首夜本就不该有信息**，
    //    guide 为空是官方正确的：
    //      · oracle 贤者      ：「每个夜晚得知**已死亡**玩家中有多少邪恶」→ 首夜无死者，不唤醒
    //      · town_crier 城镇公告员：「每个夜晚得知今天**是否有爪牙提名**」→ 首夜无白天，不唤醒
    //      · juggler 杂耍艺人  ：「每个**白天**猜测，当晚才得知猜中数」→ 首夜无猜测，不唤醒
    //      · mayor 镇长        ：无首夜行动（被动替死）
    //    因此只对「首夜必有信息」的角色做非空断言，避免把正确行为判成缺陷。
    const firstNightHasInfo = [
      "librarian",
      "chef",
      "bounty_hunter",
      "pixie",
      "fortune_teller",
      "savant",
    ];
    const normalFirst = rows.filter(
      (x) => x.state === "①常态" && firstNightHasInfo.includes(x.role)
    );
    expect(
      normalFirst.length,
      "首夜必有信息的角色应全部被探针覆盖"
    ).toBe(firstNightHasInfo.length);
    const emptyGuide = normalFirst.filter((x) => !x.guide || x.guide === "—");
    expect(
      emptyGuide.map((x) => x.role),
      "首夜必有信息的角色 guide 不得为空（否则玩家看到空弹窗）"
    ).toEqual([]);

    // ── 断言 4：明确「首夜无信息」的角色 guide 为空**是正确行为** ──
    //    若将来有人"为了让 UI 不为空"给这些角色硬塞唤醒文案，本断言会红。
    const firstNightSilent = ["oracle", "town_crier", "juggler", "mayor"];
    const silentRows = rows.filter(
      (x) => x.state === "①常态" && firstNightSilent.includes(x.role)
    );
    expect(
      silentRows.length,
      "首夜无信息角色应全部被探针覆盖"
    ).toBe(firstNightSilent.length);
    const noisy = silentRows.filter((x) => x.guide && x.guide !== "—");
    expect(
      noisy.map((x) => `${x.role}: ${x.guide}`),
      "首夜无信息角色（贤者/城镇公告员/杂耍艺人/镇长）不得被强行唤醒"
    ).toEqual([]);
  });
});
