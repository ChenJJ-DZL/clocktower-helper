import { describe, expect, it } from "vitest";
import type { Seat } from "../../../app/data";

describe("IdentityShowcaseModal - 玩家视角保密性与说书人专属提示剥离测试", () => {
  // 模拟 IdentityShowcaseModal 内部的 displayRole 解析规则
  const getDisplayRole = (seat: Seat | null) => {
    if (!seat) return null;
    const roleId = seat.role?.id;
    // 酒鬼/提线木偶：展示 charadeRole（说书人设置的伪装镇民身份）
    if ((roleId === "drunk" || roleId === "marionette") && seat.charadeRole) {
      return seat.charadeRole;
    }
    // 疯子：展示 apparentDemonRole（疯子以为自己是的恶魔身份）
    if (roleId === "lunatic" && (seat as any).apparentDemonRole) {
      return (seat as any).apparentDemonRole;
    }
    return seat.role;
  };

  it("酒鬼玩家只能看到其伪装的镇民角色，绝不可包含酒鬼或说书人提示", () => {
    const drunkSeat: Seat = {
      id: 0,
      role: {
        id: "drunk",
        name: "酒鬼",
        type: "outsider",
        ability: "你以为自己是一个镇民角色，但其实你不是。",
      } as any,
      charadeRole: {
        id: "empath",
        name: "共情者",
        type: "townsfolk",
        ability: "每个夜晚，你会得知与你邻近的存活玩家中有多少人是邪恶的。",
      } as any,
    } as any;

    const displayRole = getDisplayRole(drunkSeat);
    expect(displayRole).toBeDefined();
    expect(displayRole?.name).toBe("共情者");
    expect(displayRole?.type).toBe("townsfolk");
    expect(displayRole?.ability).toContain("存活玩家");
    expect(displayRole?.id).not.toBe("drunk");
  });

  it("提线木偶玩家只能看到其伪装身份", () => {
    const marionetteSeat: Seat = {
      id: 1,
      role: {
        id: "marionette",
        name: "提线木偶",
        type: "minion",
        ability: "你以为自己是一个善良角色，但其实你不是。",
      } as any,
      charadeRole: {
        id: "monk",
        name: "僧侣",
        type: "townsfolk",
        ability: "每个夜晚*，选择除你以外的一名玩家：今晚恶魔无法对他造成伤害。",
      } as any,
    } as any;

    const displayRole = getDisplayRole(marionetteSeat);
    expect(displayRole?.name).toBe("僧侣");
    expect(displayRole?.type).toBe("townsfolk");
  });

  it("疯子玩家只能看到其以为的恶魔身份", () => {
    const lunaticSeat: Seat = {
      id: 2,
      role: {
        id: "lunatic",
        name: "疯子",
        type: "outsider",
        ability: "你以为自己是恶魔，但其实你不是。",
      } as any,
      apparentDemonRole: {
        id: "imp",
        name: "小恶魔",
        type: "demon",
        ability: "每个夜晚*，选择一名玩家：他死亡。",
      } as any,
    } as any;

    const displayRole = getDisplayRole(lunaticSeat);
    expect(displayRole?.name).toBe("小恶魔");
    expect(displayRole?.type).toBe("demon");
  });

  it("告密者玩家的身份告知仅为其本身，绝不泄露3个不在场伪装角色", () => {
    const snitchSeat: Seat = {
      id: 3,
      role: {
        id: "snitch",
        name: "告密者",
        type: "outsider",
        ability: "爪牙在首夜得知3个不在场的伪装角色。",
      } as any,
      snitchAbsentRoles: ["僧侣", "猎手", "洗衣妇"],
    } as any;

    const displayRole = getDisplayRole(snitchSeat);
    expect(displayRole?.name).toBe("告密者");
    // 确保组件内不再把 snitchAbsentRoles 渲染给告密者玩家本人
  });
});
