/**
 * 向后兼容转发层 —— 旧路径 `helpers/poppy`。
 *
 * 夹具已泛化为**剧本无关**（`scriptFlow.ts`），支持任意剧本
 * （罂粟花开 / 暗流涌动 / …）共用同一套驱动逻辑。
 * 本文件仅为不破坏既有 `e2e/poppyganda/*.spec.ts` 的 import 而保留。
 *
 * ⚠️ 新用例**请直接 import `../helpers/scriptFlow`**。
 */
export * from "./scriptFlow";
