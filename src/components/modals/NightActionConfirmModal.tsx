"use client";

import { ModalWrapper } from "./ModalWrapper";

export interface NightActionConfirmData {
  /** 角色中文名，如 "投毒者" */
  roleName: string;
  /** 行动描述，如 "下毒"、"查验"、"保护" */
  actionDescription: string;
  /** 被选中的目标描述列表，如 ["3号", "5号"] */
  targetDescriptions: string[];
  /** 附加提示，如中毒/醉酒警告 */
  extraNote?: string;
}

interface NightActionConfirmModalProps {
  data: NightActionConfirmData | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function NightActionConfirmModal({
  data,
  onConfirm,
  onCancel,
}: NightActionConfirmModalProps) {
  if (!data) return null;

  const { roleName, actionDescription, targetDescriptions, extraNote } = data;

  const targetText =
    targetDescriptions.length > 0
      ? targetDescriptions.join("、") + " "
      : "";

  return (
    <ModalWrapper
      title={`🌙 确认夜间行动`}
      onClose={onCancel}
      footer={
        <div className="flex gap-3 w-full">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg bg-gray-600 text-white font-medium hover:bg-gray-500 transition text-sm"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition text-sm"
          >
            确认执行
          </button>
        </div>
      }
    >
      <div className="text-center space-y-3 py-4">
        <div className="text-lg font-semibold text-white">
          确认为{targetText}
          <span className="text-indigo-300">【{roleName}】</span>
          执行
          <span className="text-indigo-300">"{actionDescription}"</span>
          吗？
        </div>

        {extraNote && (
          <div className="text-sm text-yellow-400 bg-yellow-900/30 rounded-lg p-2 border border-yellow-600/30">
            ⚠️ {extraNote}
          </div>
        )}

        <div className="text-xs text-gray-400 mt-2">
          确认后将立即结算效果并推进到下一个夜间行动
        </div>
      </div>
    </ModalWrapper>
  );
}
