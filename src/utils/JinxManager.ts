import type { Seat } from "../../app/data";
import type { RegistrationResult } from "../types/registration";
import { getJinxesForCharacter } from "./jinxUtils";

/**
 * JinxManager intercepts interaction logic between specific roles.
 */
export class JinxManager {
  /**
   * Intercept information revealed to a viewing role about a target role.
   * @param target The seat being inspected
   * @param viewer The seat performing the inspection
   * @param baseResult The standard registration result before jinxes
   * @param allSeats All seats on the board (to check global presence)
   * @returns The modified registration result or the base result if no jinx applies
   */
  static interceptInspection(
    target: Seat,
    viewer: Seat,
    baseResult: RegistrationResult,
    _allSeats: Seat[]
  ): RegistrationResult {
    if (!target.role || !viewer.role) return baseResult;

    const viewerId = viewer.role.id;
    const targetId = target.role.id;

    // Fetch predefined jinx rules
    const _jinx = getJinxesForCharacter(viewerId).find(
      (j) => j.character2 === targetId
    );

    // Modify based on known jinxes and specific role interactions
    const newResult = { ...baseResult };

    // 1. Magician vs Legion: Magician registers as Evil to Legion
    if (viewerId === "legion" && targetId === "magician") {
      newResult.alignment = "Evil";
      newResult.registersAsMinion = false;
      newResult.registersAsDemon = true; // Legion sees them as part of the evil group (demon-like)
    }

    // 2. Ogre vs Spy: Spy always registers as Evil to Ogre
    if (viewerId === "ogre" && targetId === "spy") {
      newResult.alignment = "Evil";
      newResult.registersAsMinion = true;
    }

    // 3. Spy / Widow vs Heretic: Heretic acts as an Out-of-play Outsider.
    // Handled at the info generation level usually, but if inspected, return Outsider.

    // 4. Investigator vs Vizier: Storyteller doesn't announce Vizier. This is UI info logic though.

    return newResult;
  }

  /**
   * Called when a player attempts an action. Jinxes can cancel actions.
   */
  static canPerformAction(
    actor: Seat,
    target: Seat | null,
    allSeats: Seat[]
  ): { allowed: boolean; reason?: string } {
    if (!actor.role) return { allowed: true };
    const actorId = actor.role.id;

    // Example: Exorcist vs Yaggabab
    // If Exorcist chose Yaggabab, Yaggabab cannot cause deaths that night.
    // This is usually handled by the Exorcist effect directly blocking the demon wake/kill,
    // but can be centralized here if needed.

    // Vizier vs Fearmonger: Vizier cannot force execute the Fearmonger's target
    if (actorId === "vizier" && target) {
      // Check if target is Fearmonger's target
      const fearmonger = allSeats.find(
        (s) => s.role?.id === "fearmonger" && !s.isDead
      );
      if (
        fearmonger?.statusDetails?.some(
          (d) => d.includes("恐惧之灵选中") && d.includes(target.id.toString())
        )
      ) {
        return {
          allowed: false,
          reason: "相克规则：维齐尔无法对恐惧之灵选中的目标使用能力",
        };
      }
    }

    // Leviathan vs Ravenkeeper / Sage / Farmer (They don't die but ability triggers)
    // This changes the *outcome* of the action, not strictly whether it can be *performed*,
    // but could be checked here to alter killPlayer behavior.

    return { allowed: true };
  }
}
