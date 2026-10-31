/**
 * 官方范例可执行夹具 · 黯月初升 / 梦殒春宵（能力级批次）
 * ======================================================================
 * 只收录**期望可确定性判定**的范例：能力结果字段 / 死亡状态 / 信息数字。
 * 说书人任选（酒鬼假信息、疯狂判定、复活谁）与多步叙事（处决→阵营转换→再击杀）
 * 不在此文件，口径见 docs/RULE_CONFORMANCE_SYSTEM.md 第九节。
 *
 * 断言一律来自官方原文，再经 `runFullAbilityPipeline` 真实管道验证；
 * 若实现与原文不符，本条会红（而不是把实现输出抄成期望值）。
 */
import { describe } from "vitest";
import { describeOracle } from "./_rows";

describe("黯月初升 · 能力级官方范例", () => {
  describeOracle("刺客 / 教授 / 赌徒 / 驱魔人 / 旅店老板", [
    {
      // 官方范例: 刺客 #0
      id: "刺客#0：弄臣即便仍有免死能力，被刺客选中后照样死亡",
      roleId: "assassin",
      seats: ["assassin", "fool", "imp", "chef", "soldier", "mayor"],
      night: 4,
      targets: [1],
      expect: { dead: [1] },
    },
    {
      // 官方范例: 刺客 #1
      id: "刺客#1：受茶艺师保护的玩家，被刺客选中依然死亡",
      roleId: "assassin",
      seats: [
        [0, "chef", { statusEffects: [{ type: "protected" }] }],
        "tea_lady",
        "soldier",
        "assassin",
        "imp",
        "mayor",
      ],
      night: 2,
      targets: [0],
      expect: { dead: [0] },
    },
    {
      // 官方范例: 教授 #0
      id: "教授#0：选择已死亡的疯子（外来者，自称茶艺师）⇒ 无人被复活",
      roleId: "professor",
      seats: ["professor", [1, "lunatic", { isDead: true }], "imp", "chef", "soldier"],
      night: 2,
      targets: [1],
      expect: { infoFields: { revived: false }, alive: [] },
    },
    {
      // 官方范例: 教授 #1
      id: "教授#1：复活死去的镇民（祖母）⇒ 复活成功且不再处于死亡状态",
      roleId: "professor",
      seats: ["professor", [1, "grandmother", { isDead: true }], "imp", "chef", "soldier"],
      night: 2,
      targets: [1],
      expect: { infoFields: { revived: true }, alive: [1] },
    },
    {
      // 官方范例: 旅店老板 #1
      id: "旅店老板#1：保护刺客与珀，其中一人被说书人指定醉酒",
      roleId: "innkeeper",
      seats: ["innkeeper", "assassin", "pukka", "imp", "chef", "soldier"],
      night: 2,
      targets: [1, 2],
      check: ({ info }) => {
        // 官方：保护刺客和珀两人；「说书人选择让刺客醉酒」
        if (info?.target2Id !== 2 || info?.target1Id !== 1) {
          throw new Error(
            `保护目标不符：${JSON.stringify({ t1: info?.target1Id, t2: info?.target2Id })}`
          );
        }
        const drunkId = info?.drunkId;
        if (drunkId !== 1 && drunkId !== 2) {
          throw new Error(`被保护者之一应醉酒，实际 drunkId=${String(drunkId)}`);
        }
      },
    },
    {
      // 官方范例: 赌徒 #1
      id: "赌徒#1：猜错角色 ⇒ 赌徒死亡",
      roleId: "gambler",
      seats: ["gambler", "devils_advocate", "imp", "chef", "soldier"],
      night: 2,
      targets: [1],
      storytellerInput: { guessedRole: "pacifist" },
      expect: { infoFields: { isGuessCorrect: false, shouldDie: true }, dead: [0] },
    },
    {
      // 官方范例: 驱魔人 #0
      id: "驱魔人#0：选择沙巴洛斯 ⇒ 该恶魔当晚不能杀人",
      roleId: "exorcist",
      seats: ["exorcist", "shabaloth", "chef", "soldier", "mayor"],
      night: 2,
      targets: [1],
      expect: { infoFields: { isTargetDemon: true, blocked: true } },
    },
  ]);
});

describe("梦殒春宵 · 能力级官方范例", () => {
  describeOracle("神谕者 / 城贤者 / 钟表匠 / 筑梦师", [
    {
      // 官方范例: 神谕者 #0
      id: "神谕者#0：所有死亡玩家都是善良 ⇒ 得知 0",
      roleId: "oracle",
      seats: ["oracle", "imp", [2, "chef", { isDead: true }], "soldier", "mayor"],
      night: 2,
      expect: { infoFields: { deadEvilCount: 0 } },
    },
    {
      // 官方范例: 贤者 #0
      id: "贤者#0：被恶魔杀死 ⇒ 得知两名玩家，其中一名是恶魔",
      roleId: "sage",
      seats: ["sage", "imp", "chef", "soldier"],
      night: 2,
      snapshot: { nightVictimIds: [0] },
      check: ({ info }) => {
        const targets: number[] = Array.isArray(info?.targetIds)
          ? info.targetIds
          : [];
        if (targets.length !== 2) {
          throw new Error(`官方要求指出两名玩家，实际 ${JSON.stringify(targets)}`);
        }
        if (!targets.includes(1)) {
          throw new Error(
            `两名候选中必须包含恶魔（1 号），实际 ${JSON.stringify(targets)}`
          );
        }
      },
    },
    {
      // 官方范例: 钟表匠 #0
      id: "钟表匠#0：方古坐在麻脸巫婆旁边 ⇒ 得知 1",
      roleId: "clockmaker",
      seats: ["clockmaker", "fang_gu", "pit_hag", "chef", "soldier", "mayor"],
      night: 1,
      phase: "firstNight",
      expect: { info: 1 },
    },
    {
      // 官方范例: 筑梦师 #0
      id: "筑梦师#0：目标实际是畸形秀演员 ⇒ 得知「畸形秀演员或洗脑师」",
      roleId: "dreamer",
      seats: ["dreamer", "mutant", "cerenovus", "soldier", "mayor"],
      night: 2,
      targets: [1],
      check: ({ info }) => {
        if (info?.actualRole?.id !== "mutant") {
          throw new Error(`目标实际角色应为畸形秀演员，实际 ${info?.actualRole?.id}`);
        }
        const offered = [info?.roleA?.id, info?.roleB?.id].sort();
        if (JSON.stringify(offered) !== JSON.stringify(["cerenovus", "mutant"])) {
          throw new Error(`应展示「畸形秀演员 + 洗脑师」，实际 ${JSON.stringify(offered)}`);
        }
      },
    },
  ]);
});
