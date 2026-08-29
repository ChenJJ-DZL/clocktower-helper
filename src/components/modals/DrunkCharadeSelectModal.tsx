"use client";

import { useState } from "react";
import type { Role, Seat } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

interface DrunkCharadeSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedCharadeRoleId: string) => void;
  drunkSeat: Seat | null;
  availableTownsfolkRoles: Role[];
  selectedScriptId: string | null;
}

export function DrunkCharadeSelectModal({
  isOpen,
  onClose,
  onConfirm,
  drunkSeat,
  availableTownsfolkRoles,
}: DrunkCharadeSelectModalProps) {
  const [selectedRole, setSelectedRole] = useState<Role | null>(
    drunkSeat?.charadeRole || null
  );

  if (!isOpen || !drunkSeat) return null;

  const canConfirm = !!selectedRole;

  const handleConfirm = () => {
    if (selectedRole) {
      onConfirm(selectedRole.id);
      onClose(); // 关闭弹窗
    }
  };

  const currentDrunkRoleName = drunkSeat.role?.name || "角色";

  return (
    <ModalWrapper
      title={`为 ${drunkSeat.id + 1}号【${currentDrunkRoleName}】设定伪装身份`}
      onClose={onClose}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex justify-center w-full">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`w-full max-w-sm rounded-xl py-3 sm:py-4 text-base sm:text-lg font-black transition shadow-md ${
              canConfirm
                ? "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/40 ring-2 ring-purple-400 active:scale-[0.98]"
                : "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60"
            }`}
          >
            确认选择
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-2 sm:p-4 text-white flex flex-col flex-1 w-full">
        <p className="text-base sm:text-lg text-slate-200 text-center font-medium">
          请为{" "}
          <span className="text-amber-400 font-bold">{drunkSeat.id + 1}号</span>{" "}
          的{" "}
          <span className="text-purple-300 font-bold">
            {currentDrunkRoleName}
          </span>{" "}
          选择一个
          <span className="text-emerald-400 font-bold">不在场的善良镇民</span>
          角色作为其伪装身份：
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 sm:gap-3 p-1 w-full">
          {availableTownsfolkRoles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role)}
              className={`relative flex flex-col items-center justify-center py-3 sm:py-3.5 px-2 rounded-xl border-2 transition-all shadow-sm active:scale-95 ${
                selectedRole?.id === role.id
                  ? "border-purple-400 bg-purple-900/80 ring-2 ring-purple-500 scale-[1.02]"
                  : "border-slate-700 bg-slate-800/80 hover:bg-slate-700/80"
              }`}
            >
              <span className="text-base sm:text-lg font-black">
                {role.name}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">
                {role.id}
              </span>
            </button>
          ))}
        </div>
      </div>
    </ModalWrapper>
  );
}
