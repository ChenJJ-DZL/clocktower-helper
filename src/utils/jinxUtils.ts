import { Role } from '../../app/data';
import jinxes from '../data/jinxes.json';

export interface JinxRule {
    id: string;
    character1: string;
    character2: string;
    description: string;
}

// Map of Character ID -> List of Jinx Rules
// Dynamically built from src/data/jinxes.json
export const JINX_RULES: Record<string, JinxRule[]> = {};

// Build the map bidirectionally
(jinxes as JinxRule[]).forEach(rule => {
    // Add for character1
    if (!JINX_RULES[rule.character1]) {
        JINX_RULES[rule.character1] = [];
    }
    if (!JINX_RULES[rule.character1].find(r => r.id === rule.id)) {
        JINX_RULES[rule.character1].push(rule);
    }

    // Add for character2
    if (!JINX_RULES[rule.character2]) {
        JINX_RULES[rule.character2] = [];
    }
    if (!JINX_RULES[rule.character2].find(r => r.id === rule.id)) {
        JINX_RULES[rule.character2].push(rule);
    }
});

/**
 * Get all jinxes for a given character ID.
 */
export function getJinxesForCharacter(characterId: string): JinxRule[] {
    return JINX_RULES[characterId] || [];
}

/**
 * Check if two characters have a jinx.
 */
export function getJinx(char1Id: string, char2Id: string): JinxRule | undefined {
    const rules = JINX_RULES[char1Id];
    if (!rules) return undefined;
    return rules.find(r => r.character2 === char2Id);
}
