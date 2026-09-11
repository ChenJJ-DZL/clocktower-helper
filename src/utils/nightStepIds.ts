/**
 * 系统步骤 ID 常量（放在独立模块里，避免 dynamicQueueGenerator / nightInfoAdapter
 * / hooks 之间互相 import 形成循环依赖）。
 */

/**
 * 赏金猎人「阵营告知」步骤。
 *
 * 官方依据（src/data/poppyganda_official_extras.json · 赏金猎人 · 规则细节）：
 *   「被赏金猎人转变的玩家从一开始就已经属于邪恶阵营，**应该在首个夜晚立即告知他是邪恶的**，
 *    并且你作为说书人应当在给出其他夜晚信息之前谨记这回事。」
 *
 * 电子化实现：首夜队列中最先唤醒被转变的那名镇民，由说书人告知他「你已属于邪恶阵营」。
 * 由于官方强调"在给出其他夜晚信息之前"，本步骤的优先级被设为最低数值（排在最前）。
 */
export const EVIL_CONVERTED_NOTICE_ID = "evil_converted_notice";
