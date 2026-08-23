/**
 * 将任意技能/信息结果解析为【描述说明】与【核心结果】两行展示：
 * - prefix: 描述前缀（如“守鸦人在死亡前夜得知: 玩家 15(15号) 的角色是：”）
 * - result: 核心结果（如“【小恶魔】”），在下方单独一行居中醒目显示
 */
export function parseInfoResult(
  resultText: string,
  roleName?: string
): { prefix: string; result: string } {
  if (!resultText) {
    return { prefix: roleName ? `${roleName}获得信息：` : "", result: "" };
  }

  const trimmed = resultText.trim();

  // 1. 如果已有多行文本（换行符）
  if (trimmed.includes("\n")) {
    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length >= 2) {
      let prefix = lines.slice(0, lines.length - 1).join(" ");
      let result = lines[lines.length - 1];
      prefix = prefix.replace(/[:：\s]+$/, "") + "：";
      if (
        !result.startsWith("【") &&
        !result.endsWith("】") &&
        !result.startsWith("“")
      ) {
        result = `【${result}】`;
      }
      return { prefix, result };
    }
  }

  // 2. 单个纯结果值（如 "有", "没有", "是", "否", "0", "1", "2", "3" 等）
  if (/^(有|没有|是|否|\d+)$/.test(trimmed)) {
    const prefix = roleName ? `${roleName}获得信息：` : "获得信息：";
    return {
      prefix,
      result: `【${trimmed}】`,
    };
  }

  // 3. 提取末尾的【角色/结果】括号：如 “... 的角色是【小恶魔】”、“... 之中有一名是【调查员】”、“... 是【A】或【B】”
  const bracketRegex =
    /^(.*?)\s*(【[^】]+】(?:\s*(?:或|\/|、|，)\s*【[^】]+】)*)$/;
  const bracketMatch = trimmed.match(bracketRegex);
  if (bracketMatch && bracketMatch[1] && bracketMatch[2]) {
    let prefix = bracketMatch[1].trim();
    if (!prefix.endsWith("：") && !prefix.endsWith(":")) {
      prefix += "：";
    }
    return {
      prefix,
      result: bracketMatch[2].trim(),
    };
  }

  // 4. 冒号分割：如 “厨师获得信息：0” 或 “守鸦人得知：15号是小恶魔”
  const colonMatch = trimmed.match(/^(.*?[:：])\s*(.+)$/);
  if (colonMatch) {
    let prefix = colonMatch[1].trim();
    let result = colonMatch[2].trim();
    prefix = prefix.replace(/[:：\s]+$/, "") + "：";
    if (!result.startsWith("【") && !result.endsWith("】")) {
      result = `【${result}】`;
    }
    return { prefix, result };
  }

  // 5. “...是 角色名” 或 “...为 角色名”
  const isMatch = trimmed.match(
    /^(.*?(?:的角色是|之中有一名是|是|为))\s*([^：:\s]+)$/
  );
  if (isMatch) {
    let prefix = isMatch[1].trim();
    prefix = prefix.replace(/[:：\s]+$/, "") + "：";
    return {
      prefix,
      result: `【${isMatch[2].trim()}】`,
    };
  }

  // 回退处理
  return {
    prefix: roleName ? `${roleName}获得信息：` : "",
    result: trimmed.startsWith("【") ? trimmed : `【${trimmed}】`,
  };
}
