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

    // 统一将“手势0”类描述规范化为“（数字0）”，确保左右完整括号
    clean = clean.replace(/[（(]\s*手势\s*0\s*[）)]?/g, "（数字0）");
    clean = clean.replace(/手势\s*0/g, "（数字0）");

    // 清理冗余的 "玩家 X(X号)" 为 "X号"
    clean = clean.replace(/玩家\s*\d+\s*[（(](\d+号)[）)]/g, "$1");
    clean = clean.replace(/(\d+号)\s+(的角色)/g, "$1$2");

    // 智能配对括号：若右括号多于左括号，去除尾部多余右括号；若左括号多于右括号，补全右括号
    const openCount = (clean.match(/[（(]/g) || []).length;
    const closeCount = (clean.match(/[）)]/g) || []).length;
    if (closeCount > openCount) {
      clean = clean.replace(/[）)]+$/, "");
    } else if (openCount > closeCount) {
      clean = clean + "）";
    }
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

  // 特殊处理杂耍艺人专属文案：“得知的数字为X”
  if (/^得知的数字为\s*\d+$/.test(trimmed)) {
    return {
      prefix: roleName ? formatPrefix(`${roleName}获得信息`) : "获得信息",
      result: trimmed,
    };
  }

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
  //
  // ⚠️ 2026-09-13 修复「残句」：该正则里的 `得知` / `告知` 会**匹配到句子中间**的
  //    同形词。实测三类残句（结果页大字以上不成句的词开头）：
  //      · 赏金猎人：「唤醒1号【赏金猎人】。如果他之前**得知**的邪恶玩家已死亡，指向…」
  //          → 旧逻辑切成 prefix=「…如果他之前得知」/ result=「**的**邪恶玩家已死亡…」
  //      · 小精灵：「…展示角色标记**告知**其【镇长】在场。…」
  //          → result=「**其**【镇长】在场。…」
  //      · 洗脑师：「…你可以选择一名玩家与一个角色：他**得知**自己是该角色…」
  //          → result=「**自己**是该角色…」
  //    判据：切分点后若紧跟**承接性词**（的/其/自己/他/她/它），说明这是句中切分而非
  //    "信息头 + 信息值"的结构边界 → 放弃切分，交给下方回退分支整段展示。
  const infoPrefixRegex =
    /^(.*?(?:获得信息|得知信息|在死亡前夜得知|在死亡当夜得知|得知结果|得知|告诉他|告知他|告知))\s*[:：\s]*\s*(.+)$/;
  const infoPrefixMatch = trimmed.match(infoPrefixRegex);
  const continuationGuard = /^[的其自己他她它]/.test(
    (infoPrefixMatch?.[2] ?? "").trim()
  );
  if (infoPrefixMatch?.[1] && infoPrefixMatch[2] && !continuationGuard) {
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
