/**
 * 官方范例可执行夹具 · 梦殒春宵（角色交换 / 角色创造 / 诅咒）
 * ======================================================================
 * 三条规则链：
 *   · 理发师（死亡后恶魔可交换两名玩家角色，含死亡玩家）
 *   · 麻脸巫婆（把玩家变成某个**不在场**的角色；在场则无事发生）
 *   · 女巫（诅咒：被诅咒者发起提名时立即死亡 —— 这里断言诅咒标记本身）
 *
 * 断言口径：只断言官方结论（谁变成了什么角色 / 是否发生），
 * 不断言呈现文案。角色交换用 `seats[i].role.id` 对照。
 */
import { describe } from "vitest";
import { describeOracle } from "./_rows";

describe("梦殒春宵 · 角色交换与创造官方范例", () => {
  describeOracle("理发师 / 麻脸巫婆 / 女巫", [
    {
      // 官方范例: 理发师 #0
      id: "理发师#0：理发师死亡后，恶魔可以选择什么都不做",
      roleId: "barber",
      seats: [
        [0, "barber", { isDead: true }],
        "clockmaker",
        "juggler",
        "imp",
      ],
      night: 2,
      storytellerInput: {},
      check: ({ info, seats }) => {
        if (info?.swapped !== false) {
          throw new Error(`官方：恶魔决定不交换 ⇒ swapped 应为 false，实际 ${String(info?.swapped)}`);
        }
        // 对照：角色没有任何变化（防止"标记 false 但其实换了"）
        if (seats[1]?.role?.id !== "clockmaker" || seats[2]?.role?.id !== "juggler") {
          throw new Error("未交换时角色不得变化");
        }
      },
    },
    {
      // 官方范例: 理发师 #1
      id: "理发师#1：交换存活的神谕者与死亡的理发师 ⇒ 活着的是理发师、死的是神谕者",
      roleId: "barber",
      seats: [
        [0, "barber", { isDead: true }],
        "oracle",
        "imp",
        "chef",
      ],
      night: 2,
      storytellerInput: { swapA: 0, swapB: 1 },
      check: ({ seats }) => {
        if (seats[0]?.role?.id !== "oracle") {
          throw new Error(`0 号应变成神谕者，实际 ${seats[0]?.role?.id}`);
        }
        if (seats[1]?.role?.id !== "barber") {
          throw new Error(`1 号应变成理发师，实际 ${seats[1]?.role?.id}`);
        }
        // 官方：交换后「有一名存活的理发师和一名死亡的神谕者」
        if (seats[1]?.isDead === true || seats[0]?.isDead !== true) {
          throw new Error("死亡状态不随角色交换而改变");
        }
      },
    },
    {
      // 官方范例: 理发师 #2
      id: "理发师#2：涡流与存活的女巫交换角色",
      roleId: "barber",
      seats: [
        [0, "barber", { isDead: true }],
        "vortox",
        "witch",
        "chef",
      ],
      night: 2,
      storytellerInput: { swapA: 1, swapB: 2 },
      check: ({ seats }) => {
        if (seats[1]?.role?.id !== "witch" || seats[2]?.role?.id !== "vortox") {
          throw new Error(
            `应互换为 1=女巫 / 2=涡流，实际 ${seats[1]?.role?.id} / ${seats[2]?.role?.id}`
          );
        }
      },
    },
    {
      // 官方范例: 麻脸巫婆 #0
      id: "麻脸巫婆#0：想把博学者变成贤者，但贤者已在场 ⇒ 无事发生",
      roleId: "pit_hag",
      seats: ["pit_hag", "savant", "sage", "imp", "chef"],
      night: 2,
      targets: [1],
      storytellerInput: { newRoleId: "sage" },
      check: ({ info, seats }) => {
        if (info?.isAlreadyInPlay !== true || info?.transformed !== false) {
          throw new Error(`官方：角色已在场 ⇒ 不变身，实际 ${JSON.stringify(info)}`);
        }
        if (seats[1]?.role?.id !== "savant") {
          throw new Error("目标应保持博学者不变");
        }
      },
    },
    {
      // 官方范例: 麻脸巫婆 #1
      id: "麻脸巫婆#1：把卖花女孩变成镜像双子 ⇒ 场上出现善良阵营的镜像双子",
      roleId: "pit_hag",
      seats: ["pit_hag", "flowergirl", "imp", "chef"],
      night: 2,
      targets: [1],
      storytellerInput: { newRoleId: "evil_twin" },
      check: ({ info, seats }) => {
        if (info?.transformed !== true) {
          throw new Error(`应变身成功，实际 ${JSON.stringify(info)}`);
        }
        if (seats[1]?.role?.id !== "evil_twin") {
          throw new Error(`目标应变成镜像双子，实际 ${seats[1]?.role?.id}`);
        }
        // 官方：这是「善良阵营的镜像双子」（阵营不随角色创造而改变）
        if (seats[1]?.isEvilConverted === true) {
          throw new Error("变身不应改变阵营");
        }
      },
    },
    {
      // 官方范例: 女巫 #0
      id: "女巫#0：诅咒贤者 ⇒ 贤者被标记为受诅咒",
      roleId: "witch",
      seats: ["witch", "sage", "imp", "chef"],
      night: 2,
      targets: [1],
      check: ({ info, seats }) => {
        if (info?.cursed !== true || info?.targetId !== 1) {
          throw new Error(`诅咒结果不符：${JSON.stringify(info)}`);
        }
        const effects = seats[1]?.statusEffects ?? [];
        if (!effects.some((effect: any) => effect.type === "cursed")) {
          throw new Error("被诅咒者应带 cursed 状态（提名时立即死亡的判据来源）");
        }
      },
    },
  ]);
});
