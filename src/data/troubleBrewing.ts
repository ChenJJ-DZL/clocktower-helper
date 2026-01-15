import type { Role } from "../../app/data";
import troubleBrewingRolesData from "./rolesData.json";

/**
 * Trouble Brewing 剧本的角色元数据（新引擎专用入口）
 *
 * 说明：
 * - 数据源为纯 JSON（src/data/rolesData.json），只包含夜晚顺序、Setup 标记、白天技能元信息等。
 * - 通过 Role 类型断言与现有 Role 协议对齐，便于在新引擎中直接使用。
 * - 能力文字说明、旧字段等仍由 app/data.ts 中的大 roles 数组提供，后续可按需合并。
 */
export const troubleBrewingRoles: Role[] = troubleBrewingRolesData as Role[];



