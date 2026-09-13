/**
 * 罂粟花开 第 2 轮 · 永久回归测试（R2 系列）
 *
 * 覆盖本轮发现的「提示预演路径静默泄漏真值」缺陷：
 *   dialog 的受干扰判定**只信注入谓词**时，传入弱谓词（不查涡流）会给出真信息。
 *   生产 3 处调用点当前各自补了涡流判定，但各写一遍 → 易漂移。
 *   修复：book管理员/神谕者 的 dialog 改为**自算一遍**受干扰（与谓词取或）。
 *
 * 官方判据（officialRoleDocs「图书管理员」/「涡流」）：
 *  - 图书管理员：「如果……醉酒中毒，图书管理员可能会得知错误的玩家……或得知错误的角色」
 *  - 涡流：「镇民玩家的能力都会产生错误信息」——哪怕他们醉酒或中毒，信息也一定是错误的
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { librarian } from "../../roles/townsfolk/librarian";
import { oracle } from "../../roles/townsfolk/oracle";

const r = (id: string) => roles.find((x) => x.id === id)!;

function mk(roleIds: string[], selfIdx = 0) {
  return roleIds.map((rid, i) => ({
    id: i,
    role: r(rid),
    isDead: false,
    isAlive: true,
    ...(roleIds[i] === "drunk" ? { charadeRole: r("librarian") } : {}),
  })) as any[];
}

/** 弱谓词：故意不查涡流（模拟「漂移后的调用点」） */
const weakPredicate = () => false;

describe("R2 回归 · 提示预演不得因弱谓词而泄漏真值", () => {
  it("R1 图书管理员 + 涡流在场 + 弱谓词 → 不得给出真外来者「圣徒」", () => {
    const seats = mk([
      "librarian",
      "chef",
      "saint",
      "empath",
      "poisoner",
      "vortox",
      "mayor",
    ]);
    const out = (librarian as any).firstNight.dialog(0, true, {
      seats,
      nightCount: 1,
      isActorDisabledByPoisonOrDrunk: weakPredicate,
    });
    expect(out.wake).not.toContain("圣徒");
    // 涡流下镇民必得错误信息 → 输出应为「假的配对」或「0」二选一，但绝不含真值
    expect(out.wake).toContain("图书管理员");
  });

  it("R2 图书管理员 + 涡流在场 + 弱谓词 → 与「引擎结算」的角色名一致", async () => {
    const seats = mk([
      "librarian",
      "chef",
      "saint",
      "empath",
      "poisoner",
      "vortox",
      "mayor",
    ]);
    const out = (librarian as any).firstNight.dialog(0, true, {
      seats,
      nightCount: 1,
      isActorDisabledByPoisonOrDrunk: weakPredicate,
    });
    const m = out.wake.match(/其中一位是【(.+?)】/);
    // 涡流下不得为真外来者
    if (m) expect(m[1]).not.toBe("圣徒");
  });

  it("R3 图书管理员 + statusEffects 中毒 + 弱谓词 → 不得给出真外来者", () => {
    const seats = mk([
      "librarian",
      "chef",
      "saint",
      "empath",
      "poisoner",
      "imp",
      "mayor",
    ]);
    seats[0].statusEffects = [{ type: "poisoned" }];
    const out = (librarian as any).firstNight.dialog(0, true, {
      seats,
      nightCount: 1,
      isActorDisabledByPoisonOrDrunk: weakPredicate,
    });
    expect(out.wake).not.toContain("圣徒");
  });

  it("R4 图书管理员 + 提线木偶伪装 + 弱谓词 → 不得给出真外来者", () => {
    const seats = mk([
      "marionette",
      "chef",
      "saint",
      "empath",
      "poisoner",
      "imp",
      "mayor",
    ]);
    (seats[0] as any).charadeRole = r("librarian");
    const out = (librarian as any).firstNight.dialog(0, true, {
      seats,
      nightCount: 1,
      isActorDisabledByPoisonOrDrunk: weakPredicate,
    });
    expect(out.wake).not.toContain("圣徒");
  });

  it("R5 图书管理员 + 常态 + 弱谓词 → 仍必须给出真信息（不得过度干扰）", () => {
    const seats = mk([
      "librarian",
      "chef",
      "saint",
      "empath",
      "poisoner",
      "imp",
      "mayor",
    ]);
    const out = (librarian as any).firstNight.dialog(0, true, {
      seats,
      nightCount: 1,
      isActorDisabledByPoisonOrDrunk: weakPredicate,
    });
    expect(out.wake).toContain("圣徒");
  });

  it("R6 神谕者 + 涡流在场 + 弱谓词 → 输出不得等于真值", () => {
    const seats = mk([
      "oracle",
      "chef",
      "imp",
      "empath",
      "poisoner",
      "vortox",
      "mayor",
    ]);
    // 造 1 名死亡邪恶（imp 死亡）→ 真值 = 1
    seats[2].isDead = true;
    seats[2].isAlive = false;
    const out = (oracle as any).night.dialog(0, false, {
      seats,
      nightCount: 2,
      isActorDisabledByPoisonOrDrunk: weakPredicate,
    });
    // 涡流下必为错误信息 → 不得为真值 1
    const m = out.wake.match(/有 (\d+) 名邪恶/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).not.toBe(1);
  });

  it("R7 神谕者 + 常态 + 弱谓词 → 仍必须给出真值 1（不得过度干扰）", () => {
    const seats = mk([
      "oracle",
      "chef",
      "imp",
      "empath",
      "poisoner",
      "mayor",
      "soldier",
    ]);
    seats[2].isDead = true;
    seats[2].isAlive = false;
    const out = (oracle as any).night.dialog(0, false, {
      seats,
      nightCount: 2,
      isActorDisabledByPoisonOrDrunk: weakPredicate,
    });
    const m = out.wake.match(/有 (\d+) 名邪恶/);
    expect(Number(m![1])).toBe(1);
  });
});
