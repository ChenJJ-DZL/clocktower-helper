"use client";

import { useEffect } from "react";
import { installNativeDialogShim } from "../utils/nativeDialogShim";

export function NativeDialogShim() {
  useEffect(() => {
    installNativeDialogShim();
  }, []);
  return null;
}
