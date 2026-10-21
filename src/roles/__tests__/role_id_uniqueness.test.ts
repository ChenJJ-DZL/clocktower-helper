/**
 * 角色 id 唯一性护栏
 *
 * 背景：曾存在 src/roles/demon/saint.ts 占位件（id 同样是 "saint"），与官方
 * 外来者·圣徒 src/roles/outsider/saint.ts 冲突，导致 getRoleDefinition("saint")
 * 解析成恶魔、同场出现两个恶魔。占位件已删除，本测试防止同类回归。
 *
 * 说明：new_engine/*.ability.ts 里的 `id: "xxx"` 是能力 id（含内联的
 * { id, name, type } 角色引用兜底），不是角色定义，会与角色定义文件产生假重复。
 * 因此只从「导出了 RoleDefinition 的对象字面量」中提取角色 id。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getAllRoleDefinitions, getRoleDefinition } from "../index";

const rolesDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = path.resolve(rolesDir, "..", "..");
const demonSaintPath = path.join(rolesDir, "demon", "saint.ts");

/** 递归收集 src/roles 下所有 .ts 文件（跳过 __tests__ 目录） */
function collectRoleFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      files.push(...collectRoleFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      if (fullPath.includes("__tests__")) continue;
      files.push(fullPath);
    }
  }
  return files;
}

/** 角色定义对象的起始位置：`export const xxx: RoleDefinition = {` */
const ROLE_DEFINITION_START =
  /export const \w+\s*(?::\s*RoleDefinition\s*)?=\s*\{[^{}]*\}\s*(?:satisfies|as)\s+RoleDefinition|export const \w+\s*:\s*RoleDefinition\s*=\s*\{/g;

/**
 * 提取角色 id 声明：只认「角色定义对象字面量里的第一个 id 属性」，
 * 避免把能力 id / 内联角色引用误当成角色 id。
 */
function extractRoleIds(source: string): string[] {
  const ids: string[] = [];
  const pattern = new RegExp(ROLE_DEFINITION_START.source, "g");
  let match = pattern.exec(source);
  while (match !== null) {
    const body = source.slice(match.index + match[0].length);
    const idMatch = /\bid:\s*"([a-z0-9_]+)"/.exec(body);
    if (idMatch) ids.push(idMatch[1]);
    match = pattern.exec(source);
  }
  return ids;
}

describe("角色 id 唯一性", () => {
  it("不存在被多个文件声明的相同角色 id", () => {
    const files = collectRoleFiles(rolesDir);
    const idToFiles = new Map<string, string[]>();

    for (const file of files) {
      const relative = path.relative(repoRoot, file).replace(/\\/g, "/");
      for (const id of extractRoleIds(readFileSync(file, "utf8"))) {
        const owners = idToFiles.get(id) ?? [];
        if (!owners.includes(relative)) owners.push(relative);
        idToFiles.set(id, owners);
      }
    }

    const duplicated = [...idToFiles.entries()]
      .filter(([, owners]) => owners.length >= 2)
      .map(([id, owners]) => `${id} -> ${owners.join(", ")}`);

    expect(
      duplicated,
      `以下角色 id 被多个文件声明：\n${duplicated.join("\n")}`,
    ).toEqual([]);

    // 提取器本身不能是空转：至少要覆盖到全部已注册角色，且 saint 只出现一次
    expect(idToFiles.get("saint")).toEqual([
      path.relative(repoRoot, path.join(rolesDir, "outsider", "saint.ts")).replace(
        /\\/g,
        "/",
      ),
    ]);
    expect(idToFiles.size).toBeGreaterThanOrEqual(
      getAllRoleDefinitions().length,
    );
  });

  it("getRoleDefinition('saint') 指向外来者·圣徒", () => {
    expect(getRoleDefinition("saint")?.type).toBe("outsider");
  });

  it("恶魔目录下的 saint 占位件已被删除", () => {
    expect(existsSync(demonSaintPath)).toBe(false);
  });
});
