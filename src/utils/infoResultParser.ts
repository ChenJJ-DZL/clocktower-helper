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

  // 1.5 🌾 引导式陈述句（农夫死亡传承）：`唤醒XX号玩家，告知他/她：<正文>`
  //
  // 为什么必须**单独**处理，而不是塞进下面的通用正则：
  //   通用正则的头部部分用 `.*?`（非贪婪），遇到「唤醒5号玩家，告**知**他/她：」
  //   会优先在最短处收口 —— 实测把 rawHead 切成「唤醒5号玩家，告」，
  //   于是「知他/她：…」整段被当成"信息值"落到第二行大字，前缀判定也随之失配。
  //
  // 本条规则刻意写得**极窄**（必须同时满足"以唤醒X号玩家开头"+"告知他/她"），
  // 从而对既有 ~50 个角色的 `唤醒X号【角色】，告诉他…` 形态**零影响**
  // （那种形态走步骤 1 由 nightInfoGenerator 产出的多行/通用分支，行为不变）。
  //
  // 契约（与用户明确要求一致）：
  //   第一行 = 「唤醒XX号玩家，告知他/她：」（XX = **新农夫**座位号，取自文案本身，
  //            而非 `roleName` —— `roleName` 是**死掉的旧农夫**）；
  //   第二行 = 该告知新农夫的话（冒号后的全部内容，原样保留）。
  // ⚠️ 不能用 `s` 标志（tsconfig target = ES2017，TS1501）——用 `[\s\S]` 等价表示"任意字符含换行"。
  const guideDirectiveMatch = trimmed.match(
    /^唤醒\s*(\d+)\s*号玩家[，,]\s*告知(?:他|她|他\/她|她\/他)\s*[:：]\s*([\s\S]+)$/
  );
  if (guideDirectiveMatch?.[2]) {
    const successorSeatNo = guideDirectiveMatch[1];
    return {
      prefix: `唤醒${successorSeatNo}号玩家，告知他/她：`,
      result: formatResult(guideDirectiveMatch[2]),
    };
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
  //
  // ⚠️ 2026-09-14 第二类残句（农夫传承引导语）已由上方 **步骤 1.5** 单独拦下，
  //    本条通用正则**刻意保持原样**（连分隔符 `[:：\s]*` 的宽松语义都不动）。
  //    原因：实测「把 `告知他/她` 并进备选项」会连带改动 ~5 处既有形态
  //    （如「唤醒5号【赏金猎人】，指向2号玩家【罂粟种植者】（告诉他2号玩家是邪恶的）」
  //    的第二行被整段吞掉）——爆炸半径太大，得不偿失。
  const infoPrefixRegex =
    /^(.*?(?:获得信息|得知信息|在死亡前夜得知|在死亡当夜得知|得知结果|得知|告诉他|告知他|告知))\s*[:：\s]*\s*(.+)$/;
  const infoPrefixMatch = trimmed.match(infoPrefixRegex);
  const continuationGuard = /^[的其自己他她它]/.test(
    (infoPrefixMatch?.[2] ?? "").trim()
  );
  if (infoPrefixMatch?.[1] && infoPrefixMatch[2] && !continuationGuard) {
    const rawHead = infoPrefixMatch[1].trim();
    // 头部是**纯引导语**（不含任何"获得信息/得知"类结果动词）时，不能把它当"信息头"，
    // 否则第一行会变成「唤醒5号玩家，告知他/她」这种四不像。两类纯引导语：
    //   · 纯动词：「告诉他」/「告知」/「唤醒X号【角色】，告诉他」；
    //   · 引导式陈述句：「唤醒X号玩家，告知他/她」（走上方步骤 1.5，不到这里）。
    // 规范化目标是「X号-角色获得信息」，X 取 `roleName`（= 行动者座位）。
    const hasResultVerb = /获得信息|得知信息|得知结果|得知/.test(rawHead);
    const isGuideHead = !hasResultVerb && /唤醒|告诉他|告知他|告诉|告知/.test(rawHead);
    const prefix = isGuideHead
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

/**
 * 把「结果大字」按**自然语义边界**折成若干行，供结果页展示。
 *
 * 背景（2026-09-14 用户实测 · 僧侣结果页）：
 *   `僧侣保护了【1号】，该玩家今晚免受恶魔负面效果影响` 这类**长单句**原先
 *   在弹窗里用 `whitespace-nowrap` 渲染 → 溢出右侧被裁掉；而且"从中间断"很难看。
 *   用户要求：**改为 2 行**，且必须完整显示在弹窗内。
 *
 * 规则：
 *   · 已有 `\n` 的（解析器产出的多行列表）**原样返回**，不干预；
 *   · 否则在**中文标点**（，。；、！？）之后寻找**最接近中点**的切分点，
 *     折成 2 行（切分后标点保留在上一行末尾）；
 *   · 单句本身很短（≤ {@link MAX_SINGLE_LINE_CHARS} 字）**不折**，保持一行；
 *   · 找不到合适标点时**不硬折**（交给渲染层 `break-words` 兜底）。
 *
 * ⚠️ 这是**纯展示层**的折行，不修改任何结果文本本身（日志/持久化仍存原文）。
 */
export const MAX_SINGLE_LINE_CHARS = 16;

export function splitResultForDisplay(result: string): string[] {
  if (!result) return [];
  // 已含换行的多行结果：原样拆分，不重新排版
  if (result.includes("\n")) {
    return result
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  const trimmed = result.trim();
  if (trimmed.length <= MAX_SINGLE_LINE_CHARS) return [trimmed];

  // 收集所有「中文标点之后」的切分位置
  const breakPoints: number[] = [];
  const punctRe = /[，。；、！？,;!?]/g;
  let m: RegExpExecArray | null;
  while ((m = punctRe.exec(trimmed)) !== null) {
    const idx = m.index + 1; // 切在标点之后
    if (idx > 0 && idx < trimmed.length) breakPoints.push(idx);
  }
  if (breakPoints.length === 0) return [trimmed];

  // 选最接近中点、且不把任一行留得过短的切分点
  const mid = trimmed.length / 2;
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const idx of breakPoints) {
    const leftLen = idx;
    const rightLen = trimmed.length - idx;
    // 两行都不少于 4 字，且尽量均衡
    if (leftLen < 4 || rightLen < 4) continue;
    const score = Math.abs(idx - mid);
    if (score < bestScore) {
      bestScore = score;
      best = idx;
    }
  }

  if (best === -1) return [trimmed];

  const line1 = trimmed.slice(0, best).trim();
  const line2 = trimmed.slice(best).trim();
  return [line1, line2].filter((l) => l.length > 0);
}
