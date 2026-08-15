/**
 * 僵怖（Zombuul）夜晚不死免疫工具
 *
 * 【规则】"僵怖在夜晚不会死亡。白天被处决时才死亡。"
 * 任何非处决来源的击杀（夜晚技能/恶魔击杀/刺客等）对僵怖无效。
 *
 * 接入点：killPlayer（legacy 统一击杀入口）+ 新引擎击杀路径（assassin 等）。
 */
import type { Seat } from "../../app/data";

/** 判定僵怖是否被该来源豁免（非处决来源 → 夜晚不死） */
export function isZombuulNightImmune(target: any, source?: string): boolean {
  if (!target) return false;
  const isZombuul = target.role?.id === "zombuul" || target.isZombuulTrulyDead;
  if (!isZombuul) return false;
  // 处决能杀死僵怖；其余来源（夜晚技能/恶魔/刺客）均不真死
  return source !== "execution";
}

/** 给豁免的僵怖打标记（供日志/判胜识别，不真正死亡） */
export function markZombuulNightSaved(seat: any, source: string): any {
  return {
    ...seat,
    zombuulNightSaved: true,
    zombuulSavedSource: source,
  };
}
