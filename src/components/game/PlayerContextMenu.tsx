import { useCallback, useEffect, useRef, useState } from "react";
import { useGameActions } from "../../contexts/GameActionsContext";

export function PlayerContextMenu() {
  const props = useGameActions();
  const menuRef = useRef<HTMLDivElement>(null);
  const [clampedPos, setClampedPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // 边界钳制：测量菜单实际尺寸，确保完整显示在视口内
  const clampPosition = useCallback(() => {
    const el = menuRef.current;
    if (!el || !props.contextMenu) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const menuW = rect.width || 192; // w-48 = 192px fallback
    const menuH = rect.height || 300;

    let left = props.contextMenu.x;
    let top = props.contextMenu.y;

    // 右侧溢出 → 菜单左移
    if (left + menuW > vw - margin) {
      left = vw - menuW - margin;
    }
    // 左侧溢出
    if (left < margin) {
      left = margin;
    }
    // 底部溢出 → 菜单上移
    if (top + menuH > vh - margin) {
      top = vh - menuH - margin;
    }
    // 顶部溢出
    if (top < margin) {
      top = margin;
    }

    setClampedPos({ top, left });
  }, [props.contextMenu]);

  // 每次菜单打开时：先隐藏测量，再钳制显示
  useEffect(() => {
    if (!props.contextMenu) {
      setClampedPos(null);
      return;
    }
    setClampedPos(null); // 先隐藏
    // 下一帧菜单已渲染（visibility:hidden），可测量尺寸
    requestAnimationFrame(() => {
      clampPosition();
    });
  }, [props.contextMenu, clampPosition]);

  if (!props.contextMenu) return null;

  const targetSeat = props.seats.find(
    (s) => s.id === props.contextMenu?.seatId
  );
  if (!targetSeat) return null;

  const isCharade =
    targetSeat.role?.id === "drunk" || targetSeat.role?.id === "marionette";
  const effectiveRole = isCharade
    ? targetSeat.charadeRole || targetSeat.role
    : targetSeat.role;

  return (
    <div
      ref={menuRef}
      className="absolute bg-gray-800 border-2 border-gray-500 rounded-xl shadow-2xl z-[3000] w-48 overflow-hidden"
      style={{
        top: clampedPos?.top ?? props.contextMenu.y,
        left: clampedPos?.left ?? props.contextMenu.x,
        visibility: clampedPos ? "visible" : "hidden",
      }}
    >
      {targetSeat.role && (
        <button
          onClick={() => {
            props.setCurrentModal({
              type: "IDENTITY_SHOWCASE",
              data: { initialSeatId: targetSeat.id },
            });
            props.setContextMenu(null);
          }}
          className="block w-full text-left px-6 py-3 hover:bg-amber-900/80 text-amber-200 text-lg font-medium border-b border-gray-600 transition-colors"
        >
          🎴 身份告知与展示
        </button>
      )}
      {props.gamePhase === "dusk" && !targetSeat.isDead && (
        <button
          onClick={() => props.handleMenuAction("nominate")}
          disabled={
            props.contextMenu
              ? props.nominationRecords.nominators.has(props.contextMenu.seatId)
              : false
          }
          className={`block w-full text-left px-6 py-4 hover:bg-purple-900 text-purple-300 font-bold text-lg border-b border-gray-600 ${
            props.contextMenu &&
            props.nominationRecords.nominators.has(props.contextMenu.seatId)
              ? "opacity-50 cursor-not-allowed"
              : ""
          }`}
        >
          🗣️ 提名
        </button>
      )}
      {/* 开枪可以在任意环节（除了setup阶段） */}
      {!targetSeat.isDead && props.gamePhase !== "setup" && (
        <button
          onClick={() => props.handleMenuAction("slayer")}
          disabled={targetSeat.hasUsedSlayerAbility}
          className={`block w-full text-left px-6 py-4 hover:bg-red-900 text-red-300 font-bold text-lg border-b border-gray-600 ${
            targetSeat.hasUsedSlayerAbility
              ? "opacity-50 cursor-not-allowed"
              : ""
          }`}
        >
          💥 开枪
        </button>
      )}
      {/* 爪牙白天猜测落难少女 */}
      {props.gamePhase === "day" &&
        targetSeat.role?.type === "minion" &&
        !targetSeat.isDead &&
        props.seats.some((s) => s.role?.id === "damsel") && (
          <button
            onClick={() => props.handleMenuAction("damselGuess")}
            disabled={props.damselGuessUsedBy.includes(targetSeat.id)}
            className={`block w-full text-left px-6 py-3 text-lg font-medium border-t border-gray-700 ${
              props.damselGuessUsedBy.includes(targetSeat.id)
                ? "text-gray-500 cursor-not-allowed bg-gray-800"
                : "hover:bg-pink-900 text-pink-300"
            }`}
          >
            🎯 猜测落难少女
          </button>
        )}
      {/* 快捷状态标记：中毒 / 醉酒（说书人工具） */}
      {props.gamePhase !== "setup" && (
        <>
          <button
            onClick={() => props.toggleStatus("poison", targetSeat.id)}
            className="block w-full text-left px-6 py-3 hover:bg-green-900/80 text-green-200 text-lg font-medium border-t border-gray-700"
          >
            ☠️ 切换中毒标记
          </button>
          <button
            onClick={() => props.toggleStatus("drunk", targetSeat.id)}
            className="block w-full text-left px-6 py-3 hover:bg-yellow-900/80 text-yellow-200 text-lg font-medium border-t border-gray-700"
          >
            🍺 切换醉酒标记
          </button>
        </>
      )}
      {/* 陌客注册：邪恶（爪牙/恶魔） vs 善良（外来者） */}
      {effectiveRole?.id === "recluse" && props.gamePhase !== "setup" && (
        <button
          onClick={() => {
            const isCurrentlyEvil = !!(
              (targetSeat as any).registerAsEvil ||
              (targetSeat as any).registerAsDemon
            );
            props.setSeats((prev: any[]) =>
              prev.map((s) =>
                s.id === targetSeat.id
                  ? {
                      ...s,
                      registerAsEvil: !isCurrentlyEvil,
                      registerAsDemon: !isCurrentlyEvil,
                      registerAsMinion: !isCurrentlyEvil,
                    }
                  : s
              )
            );
            props.addLog?.(
              `🎭 说书人将【${targetSeat.id + 1}号-陌客】注册阵营调整为：${!isCurrentlyEvil ? "😈 邪恶 (爪牙/恶魔)" : "😇 善良 (外来者)"}`
            );
            props.setContextMenu(null);
          }}
          className="block w-full text-left px-6 py-3 hover:bg-purple-900/80 text-purple-200 text-lg font-medium border-t border-gray-700"
        >
          🎭 陌客注册：
          {(targetSeat as any).registerAsEvil ||
          (targetSeat as any).registerAsDemon
            ? "😈 邪恶 (点击切为善良)"
            : "😇 善良 (点击切为邪恶)"}
        </button>
      )}
      {/* 修补匠：说书人可在任意时刻裁定其死亡 */}
      {effectiveRole?.id === "tinker" &&
        !targetSeat.isDead &&
        props.gamePhase !== "setup" && (
          <button
            onClick={() => props.handleMenuAction("tinker_die")}
            className="block w-full text-left px-6 py-3 hover:bg-orange-900 text-orange-300 text-lg font-medium border-t border-gray-700"
          >
            🛠️ 修补匠：裁定死亡
          </button>
        )}
      {/* 造谣者：白天记录造谣并由说书人裁定真假（若为真，今晚额外死一人） */}
      {props.gamePhase === "day" &&
        effectiveRole?.id === "gossip" &&
        !targetSeat.isDead && (
          <button
            onClick={() => props.handleMenuAction("gossip_record")}
            className="block w-full text-left px-6 py-3 hover:bg-cyan-900 text-cyan-200 text-lg font-medium border-t border-gray-700"
          >
            🗣️ 造谣者：记录/裁定
          </button>
        )}
      {/* 拜访说书人：白天主动触发私密能力交互 */}
      {props.gamePhase === "day" &&
        !targetSeat.isDead &&
        effectiveRole?.dayMeta &&
        !targetSeat.hasUsedDayAbility && (
          <button
            onClick={() => props.handleMenuAction("visit_storyteller")}
            className="block w-full text-left px-6 py-3 hover:bg-indigo-900 text-indigo-200 text-lg font-medium border-t border-gray-700"
          >
            📜 拜访说书人
          </button>
        )}
      {/* 公开声明使用能力：所有玩家可见 */}
      {props.gamePhase === "day" &&
        !targetSeat.isDead &&
        effectiveRole?.dayMeta &&
        !targetSeat.hasUsedDayAbility &&
        effectiveRole.dayMeta.publicActivation && (
          <button
            onClick={() => props.handleMenuAction("public_activate_ability")}
            className="block w-full text-left px-6 py-3 hover:bg-amber-900 text-amber-200 text-lg font-medium border-t border-gray-700"
          >
            📣 公开使用能力
          </button>
        )}
      <button
        onClick={() => props.toggleStatus("dead")}
        className="block w-full text-left px-6 py-3 hover:bg-gray-700 text-lg font-medium transition-colors"
      >
        💀 切换死亡
      </button>
      {/* 提醒标记（Reminder Tokens） */}
      {props.gamePhase !== "setup" && (
        <button
          onClick={() => props.handleMenuAction("reminder_tokens")}
          className="block w-full text-left px-6 py-3 hover:bg-amber-900/80 text-amber-200 text-lg font-medium border-t border-gray-700 transition-colors"
        >
          🏷️ 提醒标记
        </button>
      )}
      {/* 在核对身份阶段及首夜刚开始时，允许选择红罗刹 */}
      {(props.gamePhase === "check" ||
        (props.gamePhase === "firstNight" && props.nightCount === 1)) && (
        <button
          onClick={() => props.toggleStatus("redherring", targetSeat.id)}
          className="block w-full text-left px-6 py-4 hover:bg-red-700 bg-red-900/30 text-red-100 text-lg font-bold border-t border-gray-700 transition-colors"
          style={{ textShadow: "0 0 8px rgba(239, 68, 68, 0.5)" }}
        >
          🎭 选为红罗刹
        </button>
      )}
      {/* 镜像双子对立目标设置：当场上有镜像双子时，允许右击任意非镜像双子玩家选为/切换对立双子 */}
      {props.seats.some((s) => s.role?.id === "evil_twin") &&
        targetSeat.role?.id !== "evil_twin" && (
          <button
            onClick={() => props.toggleStatus("good_twin", targetSeat.id)}
            className={`block w-full text-left px-6 py-4 text-lg font-bold border-t border-gray-700 transition-colors ${
              targetSeat.isGoodTwin ||
              props.evilTwinPair?.goodId === targetSeat.id
                ? "bg-purple-800/80 hover:bg-purple-700 text-purple-200"
                : "hover:bg-purple-700 bg-purple-900/30 text-purple-100"
            }`}
            style={{ textShadow: "0 0 8px rgba(168, 85, 247, 0.5)" }}
          >
            {targetSeat.isGoodTwin ||
            props.evilTwinPair?.goodId === targetSeat.id
              ? "👥 设为对立双子 (已绑定)"
              : "👥 选为对立双子"}
          </button>
        )}
      {/* 仅在准备阶段（setup）与核对阶段（check），且仅允许能够设置伪装身份的角色（酒鬼与提线木偶）显示【身份设定】 */}
      {(props.gamePhase === "setup" || props.gamePhase === "check") &&
        (targetSeat.role?.id === "drunk" ||
          targetSeat.role?.id === "marionette") && (
          <button
            onClick={() => props.handleMenuAction("charade")}
            className="block w-full text-left px-6 py-4 hover:bg-purple-700 bg-purple-900/30 text-purple-100 text-lg font-bold border-t border-gray-700 transition-colors"
            style={{ textShadow: "0 0 8px rgba(168, 85, 247, 0.5)" }}
          >
            🎭{" "}
            {targetSeat.charadeRole
              ? `身份设定 (${targetSeat.charadeRole.name})`
              : "身份设定 (设置伪装镇民)"}
          </button>
        )}
      {/* 畸形秀演员暴露切换：说书人判定"疯狂地证明外来者" */}
      {targetSeat.role?.id === "mutant" && (
        <button
          onClick={() => props.toggleStatus("mutant_reveal", targetSeat.id)}
          className={`block w-full text-left px-6 py-4 text-lg font-bold border-t border-gray-700 transition-colors ${
            (targetSeat as any).mutantRevealed
              ? "bg-rose-800/80 hover:bg-rose-700 text-rose-200"
              : "hover:bg-rose-700 bg-rose-900/30 text-rose-100"
          }`}
        >
          🦂{" "}
          {(targetSeat as any).mutantRevealed
            ? "畸形秀演员 (已暴露 · 点击取消)"
            : "畸形秀演员 (标记为已暴露)"}
        </button>
      )}
      {/* 小精灵疯狂证明切换 */}
      {targetSeat.role?.id === "pixie" && (
        <button
          onClick={() => props.toggleStatus("pixie_madness", targetSeat.id)}
          className={`block w-full text-left px-6 py-4 text-lg font-bold border-t border-gray-700 transition-colors ${
            (targetSeat as any).pixieMadnessConfirmed
              ? "bg-emerald-800/80 hover:bg-emerald-700 text-emerald-200"
              : "hover:bg-emerald-700 bg-emerald-900/30 text-emerald-100"
          }`}
        >
          🎭{" "}
          {(targetSeat as any).pixieMadnessConfirmed
            ? "小精灵疯狂证明 (已确认)"
            : "小精灵疯狂证明 (未确认)"}
        </button>
      )}
      {/* 洗脑师：被洗脑玩家不够疯狂 → 立即处决 */}
      {(targetSeat.statusDetails ?? []).some((st) =>
        st.startsWith("洗脑疯狂:")
      ) &&
        !targetSeat.isDead && (
          <button
            onClick={() => props.toggleStatus("cerenovus_execute", targetSeat.id)}
            className="block w-full text-left px-6 py-4 hover:bg-red-700 bg-red-900/40 text-red-100 text-lg font-bold border-t border-gray-700 transition-colors"
          >
            🧠 洗脑不疯狂 → 立即处决
          </button>
        )}
    </div>
  );
}
