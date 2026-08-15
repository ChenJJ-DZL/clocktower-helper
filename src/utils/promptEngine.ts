/**
 * 提示模板引擎
 * 支持变量替换、简单条件判断，动态生成说书人指引
 */

import { getPromptTemplate } from "../data/promptDictionary";

export interface PromptContext {
  [key: string]: string | number | boolean | undefined;
}

/**
 * 解析模板字符串，替换变量和处理简单条件
 */
function parseTemplate(template: string, context: PromptContext): string {
  // 替换 {{variable}} 变量
  let result = template.replace(/\{\{(\w+(\.\w+)*)\}\}/g, (match, key) => {
    const value = context[key];
    return value !== undefined ? String(value) : match;
  });

  // 处理简单三元条件 {{condition ? trueValue : falseValue}}
  result = result.replace(
    /\{\{(\w+)\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\}\}/g,
    (_match, condition, trueVal, falseVal) => {
      return context[condition] ? trueVal : falseVal;
    }
  );

  return result;
}

/**
 * 根据模板ID和上下文生成提示文本
 */
export function renderPrompt(
  promptId: string,
  context: PromptContext = {}
): string {
  let template = getPromptTemplate(promptId);

  // 🔧 Fallback：缺失模板不再返回原始 id + console.warn，
  //   而是生成有意义的默认提示（覆盖 default_wake / 空 id / 未收录角色）
  if (!template) {
    const roleName = context.roleName ?? "该角色";
    if (!promptId || promptId === "default_wake") {
      template = {
        id: "default_wake",
        category: "role" as const,
        template: `唤醒{{seatNo}}号【${roleName}】，${roleName}请行动。`,
        description: "默认唤醒提示（fallback）",
      };
    } else if (promptId.startsWith("role.") || promptId.endsWith("_wake")) {
      template = {
        id: promptId,
        category: "role" as const,
        template: `唤醒{{seatNo}}号【${roleName}】，${roleName}请行动。`,
        description: "角色唤醒提示（自动生成 fallback）",
      };
    } else {
      console.warn(`[promptEngine] 未找到模板：${promptId}`);
      return promptId;
    }
  }

  return parseTemplate(template.template, context);
}

/**
 * 直接渲染传入的模板字符串
 */
export function renderTemplate(
  template: string,
  context: PromptContext = {}
): string {
  return parseTemplate(template, context);
}

/**
 * 批量生成多个提示
 */
export function renderPrompts(
  prompts: Array<{ id: string; context?: PromptContext }>
): string[] {
  return prompts.map((p) => renderPrompt(p.id, p.context || {}));
}
