import type { Seat, Role } from "../../app/data";

export type AntagonismDecision =
  | { allowed: true }
  | { allowed: false; reason: string; blockedByRoleId?: string };

// === Minimal, data-driven antagonism rules ===
// Notes:
// - We intentionally keep this as a "rule layer" (not role abilities).
// - Rules apply only when "Djinn / 灯神" is in play (official guidance from user).
// - This file only implements the shared mechanics: block + explain + (optionally) consume-use handled by callers.

// Heuristic id for Djinn / 灯神. If your project uses a different id, add it here.
const DJINN_ROLE_IDS = new Set<string>(["djinn", "lamp_djinn", "lamp_spirit", "灯神"]);

// Global override: allow enabling antagonism even when Djinn is not in play (方案 C)
// null  -> use Djinn presence to decide
// true  -> force enable
// false -> force disable
let antagonismGlobalOverride: boolean | null = false; // 默认关闭，不产生影响

export function setAntagonismGlobalOverride(value: boolean | null) {
  antagonismGlobalOverride = value;
}

// Mutual-exclusion pairs: "only one of them can be in play at the same time".
// (We only list ids; if an id doesn't exist in current script, it simply never triggers.)
const MUTUAL_EXCLUSIVE_PAIRS: Array<[string, string]> = [
  // Heretic antagonisms
  ["heretic", "baron"],
  ["heretic", "leech"],
  ["heretic", "pit_hag"],
  // Actor antagonisms (戏子) - many partners listed by user
  ["actor", "spy"],
  ["actor", "godfather"],
  ["actor", "evil_twin"],
  ["actor", "widow"],
  ["actor", "ghost"],
  ["actor", "summoner"],
  ["actor", "riot"],
  ["actor", "legion"],
  ["actor", "leviathan"],
  ["actor", "lil_monsta"],
  ["actor", "pukka"],
  ["actor", "zombuul"],
  ["actor", "yaggababble"],
  ["actor", "kazali"],
];

// Creator cannot create specific roles (subset we can enforce generically now).
// e.g. Pit-Hag cannot create Heretic / Actor, Leviathan cannot be created after day 5 (needs more context -> TODO).
const CREATOR_CANNOT_CREATE: Record<string, Set<string>> = {
  pit_hag: new Set(["heretic", "actor"]),
  pit_hag_mr: new Set(["heretic", "actor"]),
  summoner: new Set([]),
};

function getSeatRoleId(seat: Seat | undefined | null): string | null {
  if (!seat?.role) return null;
  return seat.role.id;
}

function getRoleNameById(roles: Role[] | undefined, roleId: string): string {
  const hit = roles?.find((r) => r.id === roleId);
  return hit?.name || roleId;
}

export function isDjinnInPlay(seats: Seat[]): boolean {
  return seats.some((s) => {
    const id = getSeatRoleId(s);
    return id ? DJINN_ROLE_IDS.has(id) : false;
  });
}

export function isAntagonismEnabled(seats: Seat[]): boolean {
  if (antagonismGlobalOverride === true) return true;
  if (antagonismGlobalOverride === false) return false;
  return isDjinnInPlay(seats);
}

export function checkMutualExclusion(params: {
  seats: Seat[];
  enteringRoleId: string;
  roles?: Role[];
}): AntagonismDecision {
  const { seats, enteringRoleId, roles } = params;

  for (const [a, b] of MUTUAL_EXCLUSIVE_PAIRS) {
    if (enteringRoleId !== a && enteringRoleId !== b) continue;
    const other = enteringRoleId === a ? b : a;
    const otherInPlay = seats.some((s) => getSeatRoleId(s) === other);
    if (otherInPlay) {
      return {
        allowed: false,
        blockedByRoleId: other,
        reason: `相克规则：同一时间只能有其中一个角色在场：${getRoleNameById(roles, enteringRoleId)} 与 ${getRoleNameById(roles, other)}。`,
      };
    }
  }
  return { allowed: true };
}

export function checkCannotCreate(params: {
  seats: Seat[];
  creatorRoleId: string;
  createdRoleId: string;
  roles?: Role[];
}): AntagonismDecision {
  const { seats, creatorRoleId, createdRoleId, roles } = params;
  const blockSet = CREATOR_CANNOT_CREATE[creatorRoleId];
  if (blockSet?.has(createdRoleId)) {
    return {
      allowed: false,
      reason: `相克规则：${getRoleNameById(roles, creatorRoleId)} 无法创造 ${getRoleNameById(roles, createdRoleId)}。`,
      blockedByRoleId: createdRoleId,
    };
  }

  // Also enforce mutual-exclusion at creation time
  return checkMutualExclusion({ seats, enteringRoleId: createdRoleId, roles });
}

export function checkCannotGainAbility(params: {
  seats: Seat[];
  gainerRoleId: string;
  abilityRoleId: string;
  roles?: Role[];
}): AntagonismDecision {
  const { seats, gainerRoleId, abilityRoleId, roles } = params;
  // Generic: if gaining that ability would violate mutual exclusion, block it.
  // Caller should still consume the "use" for roles like Philosopher, per rule text.
  const mutual = checkMutualExclusion({ seats, enteringRoleId: abilityRoleId, roles });
  if (!mutual.allowed) return mutual;

  // Example from user: Frankenstein's Monster cannot gain Drunk ability.
  if (gainerRoleId === "frankenstein" && abilityRoleId === "drunk") {
    return {
      allowed: false,
      reason: `相克规则：${getRoleNameById(roles, gainerRoleId)} 不能获得 ${getRoleNameById(roles, abilityRoleId)} 的能力。`,
      blockedByRoleId: abilityRoleId,
    };
  }

  return { allowed: true };
}


