/**
 * 将任意技能/信息结果解析为【描述说明】与【核心结果】两行展示：
 * - prefix: 描述说明（例如：“送葬者得知上一个白天被处决的玩家是：” 或 “守鸦人在死亡前夜得知: 玩家 15(15号) 的角色是：”）
 * - result: 核心结果（例如：“【镇长】” 或 “【小恶魔】”），在下方单独一行居中醒目显示
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
    prefix = prefix.replace(/[:：\s]+$/, "") + "：";
    return {
      prefix,
      result: bracketMatch[2].trim(),
    };
  }

  // 4. 连接词提取：如 “...被处决的玩家是 镇长”、“...的角色是 小恶魔”、“...之中有一名是 调查员”、“...数量为 1” 等
  const connectorRegex =
    /^(.*?(?:的角色是|角色为|之中有一名是|中有一人是|之中有一位是|被处决的玩家是|被处决的是|被处决的玩家为|目标是|目标为|数量是|数量为|对数是|对数为|结果是|结果为|答案是|答案为|距离是|距离为|状态是|状态为|是|为))\s*[:：\s]*([^\s：:]+)$/;
  const connectorMatch = trimmed.match(connectorRegex);
  if (connectorMatch && connectorMatch[1] && connectorMatch[2]) {
    let prefix = connectorMatch[1].trim();
    let result = connectorMatch[2].trim();
    prefix = prefix.replace(/[:：\s]+$/, "") + "：";
    if (!result.startsWith("【") && !result.endsWith("】")) {
      result = `【${result}】`;
    }
    return { prefix, result };
  }

  // 5. 冒号分割：如 “厨师获得信息：0” 或 “占卜师查验 1号、2号，得知结果: 是”
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

  // 6. 回退兜底
  return {
    prefix: roleName ? `${roleName}获得信息：` : "",
    result: trimmed.startsWith("【") ? trimmed : `【${trimmed}】`,
  };
}
