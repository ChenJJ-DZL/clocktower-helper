"use client";

import { useEffect, useState } from "react";

interface PortraitLockProps {
  gamePhase?: string;
  onDismiss?: () => void;
}

export default function PortraitLock({
  gamePhase: _gamePhase,
  onDismiss: _onDismiss,
}: PortraitLockProps) {
  // 彻底关闭全屏阻断遮罩，允许手机直接正常进入魔典圆桌并顺畅操作
  return null;
}
