import { describe, it } from "vitest";
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
  const pf = String(info?.playerFacingGuide ?? "");
  const st = String(info?.storytellerNote ?? "");
  const flags: string[] = [];
  if (err) flags.push(`💥抛错:${err}`);
  if (!info) flags.push("⛔nightInfo=null");
  if (/undefined|NaN|\[object Object\]/.test(guide + pf)) flags.push("⚠文案含 undefined/NaN/[object]");
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

describe("罂粟花开 · 第1批 镇民矩阵（探针）", () => {
  it("跑完 13 镇民 × 常态/中毒，输出明细表", () => {
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
  });
});
