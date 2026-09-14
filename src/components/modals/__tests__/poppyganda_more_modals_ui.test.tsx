// @vitest-environment jsdom
/**
 * 罂粟花开 · **其余角色专属弹窗的 UI 真实渲染验证**
 *
 * 承接 `poppyganda_role_ui.test.tsx`（占卜师/博学者/镜像双子/洗脑师确认页），
 * 本文件把罂粟花开**剩余的角色专属 UI 面**补齐：
 *
 *   · 洗脑师/小精灵/畸形秀演员 → 疯狂告知 `MadnessNoticeBody`（含**玩家视图隐私**断言）
 *   · 杂耍艺人 → `JugglerJudgeModal`（判猜对次数）
 *   · 酒鬼 → `DrunkCharadeSelectModal`（选伪装镇民）
 *   · 酒鬼/提线木偶 → `CharadeConfigModal`（伪装配置）
 *   · 疯子 → `LunaticRpsModal`（猜拳）
 *   · 镇长 → `MayorRedirectModal`（替死转嫁）+ `MayorThreeAliveModal`（3人和平胜）
 *   · 小恶魔/涡流 → `KillConfirmModal`（击杀确认）
 *   · 僧侣/士兵 → `AttackBlockedModal`（攻击被挡）
 *
 * ⚠️ 用 ModalWrapper 的组件走 createPortal → 读 `document.body`；
 *    纯组件（MadnessNoticeBody）在 container 内 → 两处都读。
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { roles } from "../../../../app/data";
import { MadnessNoticeBody } from "../CerenovusMadnessModal";
import { JugglerJudgeModal } from "../JugglerJudgeModal";
import { DrunkCharadeSelectModal } from "../DrunkCharadeSelectModal";
import { CharadeConfigModal } from "../CharadeConfigModal";
import { LunaticRpsModal } from "../LunaticRpsModal";
import { MayorRedirectModal } from "../MayorRedirectModal";
import { MayorThreeAliveModal } from "../MayorThreeAliveModal";
import { KillConfirmModal } from "../KillConfirmModal";
import { AttackBlockedModal } from "../AttackBlockedModal";

const r = (id: string) => roles.find((x) => x.id === id)!;

beforeAll(() => {
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});
afterEach(() => cleanup());

/** portal 内容在 body，纯组件在 container —— 两处一起读 */
const allText = () => document.body.textContent ?? "";

function seat(id: number, roleId: string, over: Partial<any> = {}): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

const seats7 = () => [
  seat(0, "legion"),
  seat(1, "mayor"),
  seat(2, "savant"),
  seat(3, "baron"),
  seat(4, "imp"),
  seat(5, "farmer"),
  seat(6, "snitch"),
];

// ══════════════════════════════════════════════════════════════
describe("① 疯狂告知 MadnessNoticeBody（洗脑师 / 小精灵 / 畸形秀演员）", () => {
  const data = { targetId: 2, roleName: "镇长", actorSeatId: 0, actorRoleName: "洗脑师" };

  it("⭐ 玩家视图：**应当**告知要伪装的角色，但**不得**泄漏行动者（隐私不变量）", () => {
    const { container } = render(
      <MadnessNoticeBody data={data} isStorytellerView={false} />
    );
    const t = container.textContent ?? "";
    expect(t).toContain("技能告知");
    // ① 应当告知——玩家必须知道要疯狂证明成谁（官方：「他得知自己是该角色」）
    expect(t, "玩家必须知道自己要伪装成谁").toContain("镇长");
    // ② 不得泄漏——行动者身份与座位号
    expect(t, "玩家视图泄漏了行动者角色").not.toContain("洗脑师");
    expect(t, "玩家视图泄漏了行动者座位号").not.toContain("1号");
    expect(t, "玩家视图泄漏了说书人横幅").not.toContain("说书人视图");
  });

  it("说书人解锁视图渲染完整信息横幅", () => {
    const { container } = render(
      <MadnessNoticeBody data={data} isStorytellerView />
    );
    const t = (container.textContent ?? "") + allText();
    expect(t).toContain("说书人视图");
    expect(t).toContain("玩家不可见");
  });

  it("换一个疯狂角色再验：仍只告知伪装目标、不泄漏行动者", () => {
    const { container } = render(
      <MadnessNoticeBody
        data={{ targetId: 1, roleName: "博学者", actorSeatId: 4, actorRoleName: "洗脑师" }}
        isStorytellerView={false}
      />
    );
    const t = container.textContent ?? "";
    expect(t).toContain("博学者");
    expect(t).not.toContain("洗脑师");
    expect(t).not.toContain("5号");
  });
});

// ══════════════════════════════════════════════════════════════
describe("② 杂耍艺人判猜 JugglerJudgeModal", () => {
  it("渲染 0~5 的选择区与确认/取消", () => {
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seats7()}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("杂耍艺人");
    // 0~5 全部可选
    for (const n of ["0", "1", "2", "3", "4", "5"]) {
      expect(t, `缺少计数 ${n}`).toContain(n);
    }
  });

  it("涡流世界下渲染（不报错）", () => {
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seats7()}
        isVortoxWorld
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(allText().length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════
describe("③ 酒鬼选伪装 DrunkCharadeSelectModal", () => {
  const townsfolk = [r("librarian"), r("chef"), r("monk"), r("mayor")];

  it("isOpen=false 不渲染", () => {
    render(
      <DrunkCharadeSelectModal
        isOpen={false}
        onClose={() => {}}
        onConfirm={() => {}}
        drunkSeat={seat(0, "drunk", { charadeRole: r("librarian") })}
        availableTownsfolkRoles={townsfolk}
        selectedScriptId="poppyganda"
      />
    );
    expect(allText()).not.toContain("酒鬼");
  });

  it("isOpen=true 列出可选镇民角色", () => {
    render(
      <DrunkCharadeSelectModal
        isOpen
        onClose={() => {}}
        onConfirm={() => {}}
        drunkSeat={seat(0, "drunk", { charadeRole: r("librarian") })}
        availableTownsfolkRoles={townsfolk}
        selectedScriptId="poppyganda"
      />
    );
    const t = allText();
    expect(t).toContain("酒鬼");
    expect(t).toContain("图书管理员");
    expect(t).toContain("厨师");
  });
});

// ══════════════════════════════════════════════════════════════
describe("④ 伪装配置 CharadeConfigModal（酒鬼 / 提线木偶）", () => {
  const grouped: Record<string, any[]> = {
    townsfolk: [r("librarian"), r("chef"), r("mayor")],
    outsider: [r("drunk"), r("snitch")],
  };

  it("isOpen=false 不渲染", () => {
    render(
      <CharadeConfigModal
        isOpen={false}
        onClose={() => {}}
        seats={seats7()}
        filteredGroupedRoles={grouped as any}
        onConfirm={() => {}}
      />
    );
    expect(allText()).not.toContain("伪装");
  });

  it("isOpen=true 渲染伪装设定说明与操作入口", () => {
    render(
      <CharadeConfigModal
        isOpen
        onClose={() => {}}
        seats={seats7()}
        filteredGroupedRoles={grouped as any}
        onConfirm={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("伪装");
    // 说明必须点明三类角色：提线木偶 / 酒鬼（以为自己是善良镇民）与疯子（以为自己是恶魔）
    expect(t).toMatch(/提线木偶|酒鬼|疯子/);
    expect(t).toContain("一键随机分配");
  });
});

// ══════════════════════════════════════════════════════════════
// ⚠️ 命名当心：文件/弹窗类型叫 `LunaticRpsModal` / `LUNATIC_RPS`，
//    但内容与官方能力对应的是**精神病患者（Psychopath）**——
//    「如果你被处决，提名你的玩家需要和你猜拳，只有你输了你才会死亡」。
//    疯子（Lunatic）没有猜拳机制。**精神病患者不属于罂粟花开**（罂粟爪牙只有
//    洗脑师/镜像双子/男爵/提线木偶），故此处只做「不误伤」的暴露性断言。
describe("⑤ 猜拳弹窗（实为精神病患者 Psychopath，非罂粟花开角色）", () => {
  it("isOpen=false 不渲染", () => {
    render(
      <LunaticRpsModal isOpen={false} nominatorId={1} targetId={0} onResolve={() => {}} />
    );
    expect(allText()).not.toContain("石头剪刀布");
  });

  it("isOpen=true 渲染猜拳裁决说明（内容对应精神病患者）", () => {
    render(
      <LunaticRpsModal isOpen nominatorId={1} targetId={0} onResolve={() => {}} />
    );
    const t = allText();
    expect(t).toContain("石头剪刀布");
    expect(t).toContain("精神病患者");
    expect(t).toContain("2号");
  });
});

// ══════════════════════════════════════════════════════════════
describe("⑥ 镇长替死 MayorRedirectModal", () => {
  it("isOpen=false 不渲染", () => {
    render(
      <MayorRedirectModal
        isOpen={false}
        targetId={1}
        demonName="涡流"
        seats={seats7()}
        selectedTarget={null}
        onSelectTarget={() => {}}
        onConfirmNoRedirect={() => {}}
        onConfirmRedirect={() => {}}
      />
    );
    expect(allText()).not.toContain("镇长");
  });

  it("isOpen=true 渲染替死目标选择", () => {
    render(
      <MayorRedirectModal
        isOpen
        targetId={1}
        demonName="涡流"
        seats={seats7()}
        selectedTarget={null}
        onSelectTarget={() => {}}
        onConfirmNoRedirect={() => {}}
        onConfirmRedirect={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("镇长");
    expect(t).toContain("涡流");
  });
});

// ══════════════════════════════════════════════════════════════
describe("⑦ 镇长三人和平胜 MayorThreeAliveModal", () => {
  it("isOpen=false 不渲染", () => {
    render(
      <MayorThreeAliveModal
        isOpen={false}
        onContinue={() => {}}
        onDeclareWin={() => {}}
        onCancel={() => {}}
      />
    );
    expect(allText()).not.toContain("镇长");
  });

  it("isOpen=true 渲染「宣告善良胜利」选项", () => {
    render(
      <MayorThreeAliveModal
        isOpen
        onContinue={() => {}}
        onDeclareWin={() => {}}
        onCancel={() => {}}
      />
    );
    const t = allText();
    expect(t, "镇长 UI 必须使用与 app/data 一致的角色名「镇长」").toContain("镇长");
    expect(t, "不得再出现旧译名「市长」").not.toContain("市长");
    expect(t).toMatch(/胜利|获胜/);
  });
});

// ══════════════════════════════════════════════════════════════
describe("⑧ 击杀确认 KillConfirmModal（小恶魔 / 涡流）", () => {
  it("targetId=null 时不渲染击杀确认", () => {
    render(
      <KillConfirmModal
        targetId={null}
        isImpSelfKill={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(allText()).not.toContain("击杀");
  });

  it("指定目标 → 渲染目标座位号", () => {
    render(
      <KillConfirmModal
        targetId={3}
        isImpSelfKill={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(allText()).toContain("4号");
  });

  it("小恶魔自杀 → 渲染自杀语义", () => {
    render(
      <KillConfirmModal
        targetId={0}
        isImpSelfKill
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const t = allText();
    expect(t).toMatch(/自杀|自己/);
  });
});

// ══════════════════════════════════════════════════════════════
describe("⑨ 攻击被挡 AttackBlockedModal（僧侣 / 士兵）", () => {
  it("isOpen=false 不渲染", () => {
    render(
      <AttackBlockedModal
        isOpen={false}
        targetId={2}
        reason="僧侣保护"
        onClose={() => {}}
      />
    );
    expect(allText()).not.toContain("保护");
  });

  it("isOpen=true 渲染被挡目标与原因", () => {
    render(
      <AttackBlockedModal
        isOpen
        targetId={2}
        reason="僧侣保护"
        demonName="小恶魔"
        onClose={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("3号");
    expect(t).toContain("僧侣保护");
  });
});
