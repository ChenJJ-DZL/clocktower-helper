/**
 * ⚠️ 2026-10-23 起**不再有渲染点**（保留文件供历史对读，勿新增引用）
 * ======================================================================
 * 它曾挂在 `GameModals` 的 `currentModal?.type === "ROLE_INFO"` 分支上，而同一分支
 * 下方还有一段 `(ROLE_CODEX || ROLE_INFO) → RoleCodexModal` ⇒ 同一个 type 会
 * **同时弹出两个窗**（叠加）。收敛时保留的是 `RoleCodexModal`，因为：
 *   · 它是超集：图鉴（全剧本浏览）+ 角色详情（能力/简介/运作/范例/提示）；
 *   · 本组件的 props 里 `filteredGroupedRoles` / `groupedRoles` / `selectedScript`
 *     只有 **setup 期**才构造得出来，游戏内根本喂不进 —— 这也正是它长期
 *     `ENTRY_LOST`（零生产点）的原因，不是「忘了接线」而是「接上也用不了」。
 * `ROLE_INFO` 这个 ModalType **仍然有效**，现在由 `RoleCodexModal` 承载，
 * 入口：座位右键菜单「ℹ️ 角色资料」（带 `data.roleId` 直达该角色）。
 */
import {
  type Role,
  type Script,
  typeBgColors,
  typeColors,
  typeLabels,
} from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

interface RoleInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedScript: Script | null;
  filteredGroupedRoles: Record<string, Role[]>;
  roles: Role[];
  groupedRoles: Record<string, Role[]>;
}

export function RoleInfoModal({
  isOpen,
  onClose,
  selectedScript,
  filteredGroupedRoles,
  roles,
  groupedRoles,
}: RoleInfoModalProps) {
  if (!isOpen) return null;

  // 获取角色的行动时间说明
  const getActionTimeDescription = (role: Role): string => {
    if (role.firstNight && role.otherNight) {
      return "首夜与其他夜晚行动";
    } else if (role.firstNight && !role.otherNight) {
      return "仅首夜行动";
    } else if (!role.firstNight && role.otherNight) {
      return "其他夜晚行动";
    } else {
      return "无夜晚行动";
    }
  };

  // 如果选择了剧本，分成两部分：本剧本角色和其他角色
  const currentScriptRoles = selectedScript ? filteredGroupedRoles : {};
  const otherRoles = selectedScript
    ? (() => {
        const currentScriptRoleIds = new Set(
          Object.values(filteredGroupedRoles)
            .flat()
            .map((r) => r.id)
        );
        const other = roles.filter((r) => !currentScriptRoleIds.has(r.id));
        return other.reduce(
          (acc, role) => {
            if (!acc[role.type]) acc[role.type] = [];
            acc[role.type].push(role);
            return acc;
          },
          {} as Record<string, Role[]>
        );
      })()
    : groupedRoles;

  const renderRoleSection = (
    title: string,
    rolesToShow: Record<string, Role[]>,
    isSticky: boolean = false
  ) => (
    <div className="space-y-8">
      {title && (
        <h2
          className={`text-3xl font-bold text-yellow-400 mb-4 ${
            isSticky
              ? "sticky z-20 bg-black/95 py-3 -mt-6 -mx-8 px-8 border-b border-yellow-400/30 backdrop-blur-sm shadow-lg"
              : ""
          }`}
          style={isSticky ? { top: "0px" } : undefined}
        >
          {title}
        </h2>
      )}
      {Object.entries(rolesToShow).map(([type, roleList]) => (
        <div key={type} className="bg-gray-900/50 p-6 rounded-xl">
          <h3 className={`text-2xl font-bold mb-4 ${typeColors[type]}`}>
            {typeLabels[type]}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roleList.map((role) => (
              <div
                key={role.id}
                className={`p-5 border-2 rounded-2xl ${typeColors[type]} ${typeBgColors[type]} transition-all hover:scale-[1.02] shadow-lg`}
              >
                <div className="font-black text-xl sm:text-2xl mb-2.5 flex items-center justify-between">
                  <span>{role.name}</span>
                  <span className="text-xs sm:text-sm font-semibold px-2.5 py-0.5 rounded-full bg-black/40 border border-white/10">
                    {typeLabels[type]}
                  </span>
                </div>
                <div className="text-base sm:text-lg text-gray-100 leading-relaxed mb-3 font-medium">
                  {role.ability}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 text-sm sm:text-base text-amber-200/90 font-bold flex items-center gap-1.5">
                  <span>🌙</span>
                  <span>{getActionTimeDescription(role)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <ModalWrapper title="📖 角色信息" onClose={onClose} className="max-w-6xl">
      <div className="space-y-12">
        {selectedScript &&
          Object.keys(currentScriptRoles).length > 0 &&
          renderRoleSection(
            "🎯 正在进行中的剧本角色",
            currentScriptRoles,
            false
          )}
        {Object.keys(otherRoles).length > 0 &&
          renderRoleSection(
            selectedScript ? "📚 其他剧本角色" : "",
            otherRoles,
            false
          )}
      </div>
    </ModalWrapper>
  );
}
