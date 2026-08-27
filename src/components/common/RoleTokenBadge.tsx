"use client";

import React, { useMemo } from "react";

export interface RoleTokenBadgeProps {
  name: string;
  tokenBg?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * 角色圆形代币徽章：
 * - 1~2字单行居中显示；
 * - >=3字限定在2行内显示；
 * - 奇数字数（如5字图书管理员）自动分为“2+3”（图书 / 管理员），7字分为“3+4”；
 * - 偶数字数（如6字）分为“3+3”，4字分为“2+2”；
 * - 第一行少一个字或两行字数相等，自动缩小字号绝不换3行。
 */
export function RoleTokenBadge({
  name,
  tokenBg = "bg-slate-800 border-amber-400 text-amber-200",
  size = "md",
  className = "",
}: RoleTokenBadgeProps) {
  const tokenData = useMemo(() => {
    if (!name)
      return { lines: [""], fontSize: "text-xs", leading: "leading-none" };
    const clean = name.trim();
    const len = clean.length;

    // 1~3 个字：单行居中显示
    if (len <= 3) {
      let fontSize = "text-xs";
      if (size === "lg") {
        fontSize = len <= 2 ? "text-2xl" : "text-xl";
      } else if (size === "md") {
        fontSize = len <= 2 ? "text-[13px]" : "text-[11.5px] tracking-tight";
      } else {
        fontSize = len <= 2 ? "text-xs" : "text-[10px]";
      }
      return {
        lines: [clean],
        fontSize,
        leading: "leading-none",
      };
    }

    // 4 个字及以上：限定在 2 行内显示（5字为 2+3，6字为 3+3，7字为 3+4 ...）
    const splitIndex = Math.floor(len / 2);
    const line1 = clean.slice(0, splitIndex);
    const line2 = clean.slice(splitIndex);

    let fontSize = "text-[11px]";
    let leading = "leading-[1.1]";

    if (size === "lg") {
      if (len === 4) fontSize = "text-lg";
      else if (len === 5) fontSize = "text-base tracking-tight";
      else if (len === 6) fontSize = "text-sm tracking-tighter";
      else fontSize = "text-xs tracking-tighter";
      leading = "leading-tight";
    } else {
      if (len === 4) {
        fontSize = "text-[10.5px]";
        leading = "leading-[1.05]";
      } else if (len === 5) {
        // 5字：如 图书管理员 (2+3)
        fontSize = "text-[9.5px] tracking-tight";
        leading = "leading-[1.05]";
      } else if (len === 6) {
        // 6字：(3+3)
        fontSize = "text-[8.5px] tracking-tighter";
        leading = "leading-[1]";
      } else {
        // 7字及以上：(3+4)
        fontSize = "text-[7.5px] tracking-tighter";
        leading = "leading-[0.95]";
      }
    }

    return {
      lines: [line1, line2],
      fontSize,
      leading,
    };
  }, [name, size]);

  const sizeClass =
    size === "lg"
      ? "w-20 h-20 sm:w-22 sm:h-22 border-4 p-1.5"
      : size === "md"
        ? "w-11 h-11 border-2 p-0.5"
        : "w-9 h-9 border-2 p-0.5";

  return (
    <div
      className={`${sizeClass} rounded-full flex flex-col items-center justify-center text-center font-black shrink-0 shadow-md transition select-none ${tokenBg} ${className}`}
    >
      <div
        className={`flex flex-col items-center justify-center text-center ${tokenData.fontSize} ${tokenData.leading} w-full px-0.5`}
      >
        {tokenData.lines.map((line, idx) => (
          <span key={idx} className="block whitespace-nowrap overflow-hidden">
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}
