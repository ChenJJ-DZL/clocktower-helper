/**
 * 将任意技能/信息结果解析为【描述说明】与【核心结果】两行展示：
 * - prefix: 描述说明（例如：“5号-洗衣妇获得信息” 或 “4号-厨师获得信息”），上方小字显示，末尾不带冒号
 * - result: 核心结果（例如：“6号和9号其中一位是【占卜师】” 或 “【0】”），下方大字显示，省略内部冒号
 */
export function parseInfoResult(
  resultText: string,
  roleName?: string
): { prefix: string; result: string } {
  const formatPrefix = (p: string) => {
    let clean = p.trim().replace(/[:：\s]+$/, "");
    if (roleName) {
      const seatMatch = roleName.match(/^(\d+号)-(.+)$/);
      if (seatMatch) {
        const [, seatPart, pureRole] = seatMatch;
        if (clean.startsWith(pureRole)) {
          clean = `${seatPart}-${clean}`;
        }
      }
    }
    return clean;
  };

  const formatResult = (r: string) => {
    let clean = r.trim().replace(/[。.\s]+$/, "");
    // 清理冗余的 "玩家 X(X号)" 为 "X号"
    clean = clean.replace(/玩家\s*\d+\s*[（(](\d+号)[）)]/g, "$1");
    clean = clean.replace(/(\d+号)\s+(的角色)/g, "$1$2");
    // 清理如 "管家（9号）选择" 为 "选择" (若前缀已有角色名) 或 "管家选择"
    if (roleName) {
      const pureRoleMatch = roleName.match(/(?:^\d+号-)?(.+)$/);
      const pureRole = pureRoleMatch ? pureRoleMatch[1] : "";
      if (pureRole) {
        clean = clean.replace(
          new RegExp(`^${pureRole}\\s*[（(]\\d+号[）)]\\s*`, "g"),
          ""
        );
      }
    }
    // 去除"是："、"为："、"是 "等内部多余冒号或空格（如 是: 【角色】 或 是 【角色】 -> 是【角色】）
    clean = clean
      .replace(/是\s*[:：\s]*【/g, "是【")
      .replace(/为\s*[:：\s]*【/g, "为【");
    // 如果是单个简单词/数字/是非，用【】包裹
    if (/^(有|没有|是|否|\d+|本局没有外来者|场上没有外来者)$/.test(clean)) {
      if (!clean.startsWith("【") && !clean.endsWith("】")) {
        clean = `【${clean}】`;
      }
    }
    return clean;
  };

  if (!resultText) {
    return {
      prefix: roleName ? formatPrefix(`${roleName}获得信息`) : "",
      result: "",
    };
  }

  const trimmed = resultText.trim();

  // 0. 特殊处理互认步骤（如 12号-爪牙互认、15号-恶魔互认、军团互认）
  //    第一行小字展示角色互认步骤名（如 12号-爪牙互认），后续行大字展示纯座位号互认信息
  if (roleName?.includes("互认")) {
    const lines = trimmed
      .split("\n")
      .map((l) => l.trim().replace(/[。.\s]+$/, ""))
      .filter((l) => l.length > 0);
    return {
      prefix: formatPrefix(roleName),
      result: lines.join("\n"),
    };
  }

  // 1. 如果已有多行文本（换行符）
  if (trimmed.includes("\n")) {
    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length >= 2) {
      const rawPrefix = lines.slice(0, lines.length - 1).join(" ");
      const result = formatResult(lines[lines.length - 1]);
      const prefix = formatPrefix(rawPrefix);
      return { prefix, result };
    }
  }

  // 2. 匹配标准前缀：“...获得信息：(内容)” / “...得知：(内容)” / “...得知结果：(内容)” / “...告诉他(内容)” / “...告知(内容)”
  const infoPrefixRegex =
    /^(.*?(?:获得信息|得知信息|在死亡前夜得知|在死亡当夜得知|得知结果|得知|告诉他|告知他|告知))\s*[:：\s]*\s*(.+)$/;
  const infoPrefixMatch = trimmed.match(infoPrefixRegex);
  if (infoPrefixMatch?.[1] && infoPrefixMatch[2]) {
    const rawHead = infoPrefixMatch[1].trim();
    // 如果头部只是纯引导动词（如 "告诉他" / "告知" / "唤醒X号【角色】，告诉他"），将 prefix 规范化为 "X号-角色获得信息"
    const prefix =
      rawHead.includes("唤醒") || /^(告诉他|告知他|告知)$/.test(rawHead)
        ? roleName
          ? formatPrefix(`${roleName}获得信息`)
          : "获得信息"
        : formatPrefix(rawHead);
    const result = formatResult(infoPrefixMatch[2]);
    return { prefix, result };
  }

  // 3. 单个纯结果值（如 "有", "没有", "是", "否", "0", "1", "2", "3" 等）
  if (/^(有|没有|是|否|\d+)$/.test(trimmed)) {
    const prefix = roleName ? formatPrefix(`${roleName}获得信息`) : "获得信息";
    return {
      prefix,
      result: `【${trimmed}】`,
    };
  }

  // 4. 冒号分割通用匹配
  const colonMatch = trimmed.match(/^(.*?[:：])\s*(.+)$/);
  if (colonMatch?.[1] && colonMatch[2]) {
    const prefix = formatPrefix(colonMatch[1]);
    const result = formatResult(colonMatch[2]);
    return { prefix, result };
  }

  // 5. 回退兜底
  return {
    prefix: roleName ? formatPrefix(`${roleName}获得信息`) : "",
    result: formatResult(trimmed),
  };
}
