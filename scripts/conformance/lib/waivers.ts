/**
 * 人审 waiver（豁免/裁定）台账
 * ======================================================================
 * 为什么需要：有些偏差**不是代码 bug**，而是：
 *   · 项目对官方角色的有意建模差异（如把官方旅行者「替罪羊」作为剧本角色位）；
 *   · 旅行者能力由 legacy/travelerHooks 承载，新引擎不注册；
 *   · 自定义/变体角色无官方规范；
 *   · 官方数据自相矛盾（需产品/规则裁定）。
 *
 * 规则：这些差异**不允许被静默忽略**，必须写进 `scripts/conformance/waivers.json`：
 *   匹配的 check + roleId/roleNameCn、裁定理由、裁定人、日期。
 * 审计会把命中的 finding 降级为 `INFO + waived=true` 并写入报告，
 * 棘轮仍然防止"新增未登记偏差"；waiver 文件本身随代码评审。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  ConformanceFinding,
  WaiverEntry,
  WaiverFile,
} from "./types";

export const WAIVERS_FILE = path.join(
  "scripts",
  "conformance",
  "waivers.json"
);

/** 读取 waiver 台账（文件缺失 = 空台账，不报错） */
export function loadWaivers(root = process.cwd()): WaiverEntry[] {
  const file = path.join(root, WAIVERS_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as WaiverFile;
    return Array.isArray(parsed.waivers) ? parsed.waivers : [];
  } catch {
    console.warn(`[conformance] waiver 文件解析失败：${file}`);
    return [];
  }
}

function matches(finding: ConformanceFinding, waiver: WaiverEntry): boolean {
  if (finding.check !== waiver.check) return false;
  if (waiver.roleId) return finding.roleId === waiver.roleId;
  if (waiver.roleNameCn) return finding.roleNameCn === waiver.roleNameCn;
  // 未限定角色 = 该 check 的全局裁定
  return true;
}

/**
 * 应用 waiver：命中的 finding 降级为 INFO 并打上 waived 标记。
 * 返回新的 findings 数组与命中数量（不修改入参对象）。
 */
export function applyWaivers(
  findings: ConformanceFinding[],
  waivers: WaiverEntry[]
): { findings: ConformanceFinding[]; waivedCount: number } {
  if (waivers.length === 0) return { findings, waivedCount: 0 };
  let waivedCount = 0;
  const applied = findings.map((finding) => {
    const waiver = waivers.find((entry) => matches(finding, entry));
    if (!waiver) return finding;
    waivedCount++;
    return {
      ...finding,
      severity: "INFO" as const,
      waived: true,
      waiverReason: waiver.reason,
      detail: `${finding.detail}（已 waiver：${waiver.reason}）`,
    };
  });
  return { findings: applied, waivedCount };
}

/** 统计"未被任何 finding 命中"的 waiver（提示台账需要清理/修正） */
export function unusedWaivers(
  findings: ConformanceFinding[],
  waivers: WaiverEntry[]
): WaiverEntry[] {
  return waivers.filter(
    (waiver) => !findings.some((finding) => matches(finding, waiver))
  );
}
