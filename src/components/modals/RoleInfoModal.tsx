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
                className={`p-4 border-2 rounded-lg ${typeColors[type]} ${typeBgColors[type]} transition-all hover:scale-105`}
              >
                <div className="font-bold text-lg mb-2">{role.name}</div>
                <div className="text-sm text-gray-300 leading-relaxed mb-2">
                  {role.ability}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-400">
                  {getActionTimeDescription(role)}
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
