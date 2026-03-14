import type { RoleType } from "../../app/data";

export type RegistrationResult = {
  alignment: "Good" | "Evil";
  roleType: RoleType | null;
  registersAsDemon: boolean;
  registersAsMinion: boolean;
};
