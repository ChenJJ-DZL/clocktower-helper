/**
 * 官方范例可执行夹具 · 黯月初升（免死判据批次）
 * ======================================================================
 * 官方这几条范例是**多步叙事**（处决 → 阵营转换 → 再次处决），当前能力管道
 * 装不下整段剧情。但它们的每条结论都落在 `src/utils/bmrMechanics.ts` 的
 * **单一事实源谓词**上，因此这里按「判据级」编码：
 *   · 剧情中的状态变化用座位字段显式表达（等价于说书人裁定）；
 *   · 断言只针对官方结论本身（谁该死、谁不该死），不复制规则实现。
 *
 * 若将来建了场景级 harness，这批应升级为端到端流程断言（届时保留 id 即可）。
 */
import { describe, expect, it } from "vitest";
import {
  canFoolSurvive,
  isProtectedByDevilsAdvocate,
  isProtectedByTeaLady,
} from "../../../src/utils/bmrMechanics";
import { seat } from "./_harness";

describe("黯月初升 · 免死判据官方范例", () => {
  // 官方范例: 茶艺师 #0
  it("茶艺师#0：邻近存活玩家都善良 ⇒ 他们不会死亡；其中一人转邪 ⇒ 保护消失", () => {
    // 官方剧情：主谋被处决后，茶艺师邻近的存活玩家是善良的莽夫与侍臣，
    // 恶魔攻击侍臣但侍臣存活；之后莽夫转变为邪恶，恶魔再次攻击侍臣 ⇒ 侍臣死亡。
    const seats = [
      seat(0, "mastermind", { isDead: true }), // 已被处决，不再是存活邻座
      seat(1, "goon"), // 莽夫（初始善良）
      seat(2, "courtier"), // 侍臣：被保护的邻座
      seat(3, "tea_lady"),
    ];
    expect(
      isProtectedByTeaLady(2, seats),
      "两名存活邻座都善良 ⇒ 侍臣受保护"
    ).toBe(true);

    // 莽夫转变为邪恶阵营（说书人裁定，官方剧情：莽夫转变为邪恶的）
    const afterGoonTurnedEvil = seats.map((entry: any) =>
      entry.id === 1 ? { ...entry, isEvilConverted: true } : entry
    );
    expect(
      isProtectedByTeaLady(2, afterGoonTurnedEvil),
      "邻座之一转邪 ⇒ 茶艺师保护失效，侍臣可被杀死"
    ).toBe(false);
  });

  // 官方范例: 弄臣 #0
  it("弄臣#0：首次被处决存活；免死消耗后第二次被处决死亡", () => {
    const firstTime = seat(0, "fool", { foolUsed: false });
    expect(canFoolSurvive(firstTime), "首次将死 ⇒ 不会死亡").toBe(true);

    const used = seat(0, "fool", { foolUsed: true });
    expect(
      canFoolSurvive(used),
      "已经用过免死 ⇒ 第四个白天再次被处决时死亡"
    ).toBe(false);
  });

  // 官方范例: 弄臣 #1
  it("弄臣#1：恶魔夜袭时首次免死，当晚无人死亡", () => {
    const fool = seat(0, "fool");
    expect(canFoolSurvive(fool), "夜袭属于「首次将要死亡」⇒ 存活").toBe(true);
    // 对照：醉酒的弄臣没有能力 ⇒ 会死（判据不是恒真）
    expect(
      canFoolSurvive(seat(1, "fool", { isDrunk: true })),
      "醉酒弄臣失去免死能力"
    ).toBe(false);
  });

  // 官方范例: 魔鬼代言人 #0
  it("魔鬼代言人#0：为自己挂上处决保护 ⇒ 被处决但依然存活", () => {
    const protectedSelf = seat(0, "devils_advocate", {
      statusEffects: [{ type: "execution_protected", source: "devils_advocate" }],
    });
    expect(isProtectedByDevilsAdvocate(protectedSelf)).toBe(true);

    // 对照：保护标记被消耗后，再次处决就会死亡
    const consumed = seat(0, "devils_advocate", { statusEffects: [] });
    expect(isProtectedByDevilsAdvocate(consumed)).toBe(false);
  });

  // 官方范例: 魔鬼代言人 #1
  it("魔鬼代言人#1：保护僵怖 ⇒ 首次处决存活；保护耗尽后再次处决死亡", () => {
    const protectedZombuul = seat(1, "zombuul", {
      isExecutionProtected: true,
    });
    expect(isProtectedByDevilsAdvocate(protectedZombuul)).toBe(true);

    const nextDay = { ...protectedZombuul, isExecutionProtected: false };
    expect(
      isProtectedByDevilsAdvocate(nextDay),
      "保护已消耗 ⇒ 下一个白天再被处决即死亡"
    ).toBe(false);
  });
});
