/**
 * 信息类角色判定
 *
 * 用途：涡流（Vortox）只让「获取信息的镇民能力」产出假信息，
 * **不影响不产出信息的能力**（僧侣的保护、士兵的免疫、管家、镇长等）。
 *
 * ⚠️ 本集合只用于**显示层**判断（是否给该行动打「受干扰」标记 / 是否按假信息处理）。
 * 涡流的假信息写入逻辑仍由 nightInfoGenerator 的 effectivePoisoned 负责，改这里不会动到规则实现。
 */
import type { RoleType } from "../../app/data";

/** 会产出信息的角色（按需扩展；未列入的能力不会被标记为「受干扰」） */
export const INFORMATION_ROLE_IDS = new Set<string>([
  // 首夜信息
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "clockmaker",
  "noble",
  "knight",
  "shugenja",
  "balloonist",
  // 每夜信息
  "empath",
  "fortune_teller",
  "undertaker",
  "ravenkeeper",
  "seamstress",
  "flowergirl",
  "dreamer",
  "oracle",
  "town_crier",
  "sage",
  "mathematician",
  "fisherman",
  "huntsman",
  "minstrel",
  "alsaahir",
  "high_priestess",
  "village_idiot",
  "whisperer",
  // 非镇民的信息类
  "snake_charmer",
  "spy",
  "philosopher",
  "drunk",
  "pixie",
]);

/** 该角色是否为「信息类」能力（涡流只会干扰这一类） */
export function isInformationRole(
  roleId: string | undefined | null,
  roleType?: RoleType | string | undefined
): boolean {
  if (!roleId) return false;
  // 只有镇民会被涡流影响假信息；外来者/爪牙/恶魔不在涡流规则范围内
  if (roleType && roleType !== "townsfolk" && !INFORMATION_ROLE_IDS.has(roleId))
    return false;
  return INFORMATION_ROLE_IDS.has(roleId);
}
