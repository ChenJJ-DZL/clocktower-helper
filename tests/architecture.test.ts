import { getRoleDefinition, roleRegistry } from "../src/roles/index";

describe("新架构核心验证", () => {
  // 1. 验证注册表是否正常工作
  test("角色注册表应包含僧侣", () => {
    const monkDef = roleRegistry.get("monk");
    expect(monkDef).toBeDefined();
    expect(monkDef?.name).toBe("僧侣");
    expect(monkDef?.id).toBe("monk");
    expect(monkDef?.type).toBe("townsfolk");
  });

  // 2. 验证 getRoleDefinition 辅助函数
  test("getRoleDefinition 应能正确获取角色定义", () => {
    const monkDef = getRoleDefinition("monk");
    expect(monkDef).toBeDefined();
    expect(monkDef?.name).toBe("僧侣");

    // 测试不存在的角色
    const nonExistent = getRoleDefinition("non_existent_role");
    expect(nonExistent).toBeUndefined();
  });

  // 3. 验证其他已注册的角色
  test("注册表应包含所有已迁移的角色", () => {
    const expectedRoles = [
      "monk",
      "washerwoman",
      "librarian",
      "investigator",
      "chef",
      "poisoner",
    ];

    expectedRoles.forEach((roleId) => {
      const roleDef = roleRegistry.get(roleId);
      expect(roleDef).toBeDefined();
      expect(roleDef?.id).toBe(roleId);
    });
  });
});
