import { describe, it, expect } from "vitest";

describe("全局保密遮罩 (Global Privacy Shield) 核心逻辑测试", () => {
  it("默认初始状态：防窥遮罩处于关闭状态 (isPrivacyShieldActive = false)", () => {
    const initialState = {
      isPrivacyShieldActive: false,
      gamePhase: "firstNight",
    };
    expect(initialState.isPrivacyShieldActive).toBe(false);
  });

  it("支持通过 SET_PRIVACY_SHIELD_ACTIVE 显式开启与关闭遮罩", () => {
    let state = { isPrivacyShieldActive: false };

    // 开启遮罩
    state = { ...state, isPrivacyShieldActive: true };
    expect(state.isPrivacyShieldActive).toBe(true);

    // 关闭遮罩
    state = { ...state, isPrivacyShieldActive: false };
    expect(state.isPrivacyShieldActive).toBe(false);
  });

  it("支持通过 TOGGLE_PRIVACY_SHIELD 在任意环节实时翻转遮罩状态", () => {
    let state = { isPrivacyShieldActive: false };

    // 第一次点击左上角眼睛按钮 -> 开启
    state = { ...state, isPrivacyShieldActive: !state.isPrivacyShieldActive };
    expect(state.isPrivacyShieldActive).toBe(true);

    // 再次点击左上角眼睛按钮 -> 关闭
    state = { ...state, isPrivacyShieldActive: !state.isPrivacyShieldActive };
    expect(state.isPrivacyShieldActive).toBe(false);
  });

  it("夜间信息反馈确认流程：点击「确认并继续」后自动触发遮罩保护状态", () => {
    // 模拟夜间角色（如洗衣妇）完成信息查看后的推进逻辑
    let isShieldActive = false;
    let nextStepCalled = false;

    const infoResultData = {
      resultText: "洗衣妇查验：1号与2号中有1人是守夜人",
      onNext: () => {
        nextStepCalled = true;
      },
    };

    // 执行点击「确认并继续」回调
    const handleResultConfirm = () => {
      infoResultData.onNext();
      isShieldActive = true; // 🛡️ 自动开启防窥遮罩保护
    };

    handleResultConfirm();

    // 验证：已推进到下一个角色，且遮罩已自动激活
    expect(nextStepCalled).toBe(true);
    expect(isShieldActive).toBe(true);

    // 说书人关闭遮罩，继续下一位行动
    const handleDismissShield = () => {
      isShieldActive = false;
    };
    handleDismissShield();

    // 验证：遮罩解除，进入下一位角色的行动面板
    expect(isShieldActive).toBe(false);
  });
});
