/**
 * 官方范例可执行夹具 · 梦殒春宵 · 诺-达鲺（毒邻近镇民）
 * ======================================================================
 * 判据唯一事实源：`src/utils/snvMechanics.ts::getNoDashiiPoisonTargets`
 *   · 顺时针 / 逆时针各取**最近的镇民**（跳过非镇民）
 *   · **不跳过已死亡的镇民** —— 官方明写「无论这些镇民是存活还是死亡」，
 *     因此初始邻座死后，更远的新邻座**不会**被顶上来中毒。
 */
import { describe, expect, it } from "vitest";
import { getNoDashiiPoisonTargets } from "../../../src/utils/snvMechanics";
import { seat } from "./_harness";

describe("梦殒春宵 · 诺-达鲺官方范例", () => {
  // 官方范例: 诺-达鲺 #1
  it("诺-达鲺#1：顺时针最近镇民是哲学家、逆时针最近镇民是女裁缝 ⇒ 这两人中毒", () => {
    // 官方座位（顺时针）：哲学家 → 数学家 → 贤者 →（诺-达鲺）→ 女巫 → 畸形秀演员 → 女裁缝
    // 环形展开后：0=诺-达鲺，顺时针 1..3 为 哲学家/数学家/贤者，逆时针 6..4 为 女裁缝/畸形秀演员/女巫
    const seats = [
      seat(0, "no_dashii"),
      seat(1, "philosopher"),
      seat(2, "mathematician"),
      seat(3, "sage"),
      seat(4, "cerenovus"), // 女巫（爪牙）—— 非镇民，必须被跳过
      seat(5, "mutant"), // 畸形秀演员（外来者）—— 同样跳过
      seat(6, "seamstress"), // 女裁缝（镇民）
    ];
    expect(getNoDashiiPoisonTargets(0, seats).sort()).toEqual([1, 6]);
  });

  // 官方范例: 诺-达鲺 #0
  it("诺-达鲺#0：初始邻座死后，更远的存活玩家不会顶上来中毒", () => {
    // 官方：开局与城镇公告员、舞蛇人相邻 ⇒ 两人中毒；几天后他们都死了，
    // 「与诺-达鲺最近的存活玩家变为了钟表匠和理发师，但他们不会受到诺-达鲺的影响」。
    const seats = [
      seat(0, "no_dashii"),
      seat(1, "town_crier", { isDead: true }), // 已死亡，仍是「最近的镇民」
      seat(2, "clockmaker"), // 更远的存活镇民 —— 不得被毒
      seat(3, "barber"), // 更远的存活镇民 —— 不得被毒
      seat(6, "snake_charmer", { isDead: true }), // 逆时针最近的镇民（已死）
    ];
    const targets = getNoDashiiPoisonTargets(0, seats);
    expect(targets.sort()).toEqual([1, 6]);
    expect(
      targets.includes(2) || targets.includes(3),
      "官方：新近的存活玩家不中毒 ⇒ 不得把更远的镇民算进来"
    ).toBe(false);
  });
});
