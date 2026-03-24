import type { Role, RoleType } from "../../app/data";

export type RegistrationDimension =
  | "alignment" // 阵营判定
  | "roleType" // 角色类型判定
  | "isDemon" // 是否为恶魔
  | "isMinion" // 是否为爪牙
  | "isOutsider" // 是否为外来者
  | "isTownsfolk" // 是否为镇民
  | "specificRole"; // 具体角色判定

export type RegistrationOverride = {
  dimension: RegistrationDimension;
  overrideValue: any;
  priority: number;
  sourceRole: Role;
  sourcePlayerId: number;
  condition?: (viewer: Role | null) => boolean;
  expiresAt?: string; // 过期时间，如 "黄昏"、"夜晚结算"
};

export type RegistrationResult = {
  alignment: "Good" | "Evil";
  roleType: RoleType | null;
  registersAsDemon: boolean;
  registersAsMinion: boolean;
  registersAsOutsider: boolean;
  registersAsTownsfolk: boolean;
  registeredRole?: Role | null;
  overrides: RegistrationOverride[];
};
