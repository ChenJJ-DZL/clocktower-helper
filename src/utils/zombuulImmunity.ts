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
