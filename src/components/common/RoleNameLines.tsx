import type { CSSProperties } from "react";
import { splitRoleNameLines } from "./roleNameWrap";

export { splitRoleNameLines };

export interface RoleNameLinesProps {
  name?: string | null;
  /** 外层容器的类名（字号 / 字重 / 颜色 / 删除线等随外层一起传入） */
  className?: string;
  style?: CSSProperties;
}

/**
 * 座位等窄容器里的角色名渲染：>= 5 字强制折成「前 3 字 + 剩余字」两行。
 * 外层用块级 flex（而不是 inline-flex），块级子元素才能继承 text-decoration，
 * 这样死亡玩家的 line-through 删除线仍会划在两行文字上。
 */
export function RoleNameLines({ name, className, style }: RoleNameLinesProps) {
  const lines = splitRoleNameLines(name);

  if (lines.length === 1) {
    return (
      <span className={className} style={style}>
        {lines[0]}
      </span>
    );
  }

  return (
    <span className={`${className ?? ""} flex flex-col items-center`} style={style}>
      {lines.map((line, index) => (
        <span key={index} className="whitespace-nowrap">
          {line}
        </span>
      ))}
    </span>
  );
}

export default RoleNameLines;
