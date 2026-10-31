/**
 * 官方范例可执行夹具 · 黯月初升（信息与自我死亡）
 * ======================================================================
 *   · 造谣者：公开声明为假 ⇒ 当晚无人因其能力死亡；造谣者已死亡 ⇒ 能力失效（不唤醒）
 *   · 修补匠：被茶艺师保护时，说书人不能让其「因自己的能力」死亡
 *
 * ⚠️ 造谣者的「声明真假」是说书人对公开声明的裁定（`storytellerInput.isStatementTrue`），
 *    属于**场景输入**而不是答案；断言针对的是官方结论（是否有人死亡）。
 */
import { describe } from "vitest";
import { describeOracle } from "./_rows";

describe("黯月初升 · 造谣者与修补匠官方范例", () => {
  describeOracle("造谣者 / 修补匠", [
    {
      // 官方范例: 造谣者 #0
      id: "造谣者#0：声明为假 ⇒ 当晚无人因造谣者能力死亡",
      roleId: "gossip",
      seats: ["gossip", "imp", "chef", "soldier"],
      night: 2,
      storytellerInput: { statement: "恶魔戴着帽子", isStatementTrue: false },
      check: ({ info, seats }) => {
        if (info?.shouldKill !== false) {
          throw new Error(`假声明不应触发击杀，实际 ${JSON.stringify(info)}`);
        }
        const dead = seats.filter((entry: any) => entry.isDead).map((entry: any) => entry.id);
        if (dead.length > 0) {
          throw new Error(`官方：当晚没有玩家死亡，实际死亡 ${JSON.stringify(dead)}`);
        }
      },
    },
    {
      // 官方范例: 造谣者 #2
      id: "造谣者#2：造谣者当晚被恶魔杀死 ⇒ 失去能力，正确声明也不再致死",
      roleId: "gossip",
      seats: [[0, "gossip", { isDead: true }], "imp", "chef", "soldier"],
      night: 2,
      storytellerInput: { statement: "恶魔戴着帽子", isStatementTrue: true },
      expect: { aborted: true },
    },
    {
      // 官方范例: 修补匠 #2
      id: "修补匠#2：受茶艺师保护 ⇒ 说书人不能让修补匠因自己的能力死亡",
      roleId: "tinker",
      seats: ["tinker", "tea_lady", "chef", "imp", "soldier"],
      night: 2,
      storytellerInput: { shouldKillTinker: true },
      check: ({ info, seats }) => {
        if (info?.isProtected !== true) {
          throw new Error(`应判定为受茶艺师保护，实际 ${JSON.stringify(info)}`);
        }
        if (info?.shouldDie !== false || seats[0]?.isDead === true) {
          throw new Error("受保护时不得死亡");
        }
      },
    },
  ]);
});
