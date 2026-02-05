import { Role } from '../../app/data';

export interface JinxRule {
    id: string;
    character1: string;
    character2: string;
    description: string;
}

// Map of Character ID -> List of Jinx Rules
// Updated based on 'josn/相克规则.json'
export const JINX_RULES: Record<string, JinxRule[]> = {
    // === Chamberlain / Maid ===
    "chambermaid": [
        {
            id: "chambermaid_mathematician",
            character1: "chambermaid",
            character2: "mathematician",
            description: "侍女会得知数学家是否醒来，即使她是在数学家之前醒来。"
        }
    ],
    "mathematician": [
        {
            id: "chambermaid_mathematician",
            character1: "chambermaid",
            character2: "mathematician",
            description: "侍女会得知数学家是否醒来，即使她是在数学家之前醒来。"
        },
        {
            id: "mathematician_drunk",
            character1: "mathematician",
            character2: "drunk",
            description: "数学家可能会得知酒鬼产生了错误信息或“能力未正常生效”。"
        },
        {
            id: "mathematician_lunatic",
            character1: "mathematician",
            character2: "lunatic",
            description: "数学家可能会得知疯子是否攻击了与真正的恶魔不同的目标。"
        },
        {
            id: "mathematician_marionette",
            character1: "mathematician",
            character2: "marionette",
            description: "数学家可能会得知提线木偶产生了错误信息或“能力未正常生效”。"
        }
    ],

    // === Philosopher ===
    "philosopher": [
        {
            id: "philosopher_bounty_hunter",
            character1: "philosopher",
            character2: "bounty_hunter",
            description: "如果哲学家获得了赏金猎人的能力，可能会有一名镇民玩家转变为邪恶。"
        }
    ],
    "bounty_hunter": [
        {
            id: "philosopher_bounty_hunter",
            character1: "philosopher",
            character2: "bounty_hunter",
            description: "如果哲学家获得了赏金猎人的能力，可能会有一名镇民玩家转变为邪恶。"
        }
    ],

    // === Cannibal ===
    "cannibal": [
        {
            id: "cannibal_poppy_grower",
            character1: "cannibal",
            character2: "poppy_grower",
            description: "如果食人族获得了罂粟种植者的能力，当他获得下一个能力时，爪牙和恶魔也会互相认识。"
        },
        {
            id: "cannibal_juggler",
            character1: "cannibal",
            character2: "juggler",
            description: "如果杂耍艺人在自己的首个白天猜测后在当天死于处决，当晚食人族会替杂耍艺人得知对应的信息。"
        },
        {
            id: "cannibal_butler",
            character1: "cannibal",
            character2: "butler",
            description: "如果食人族获得了管家的能力，他会得知这一信息。"
        },
        { // Assuming '狂热者' is a translated role, likely 'Zealot' or specific homebrew, using generic ID
            id: "cannibal_zealot",
            character1: "cannibal",
            character2: "zealot",
            description: "如果食人族获得了狂热者的能力，他会得知这一信息。"
        },
        { // Princess
            id: "cannibal_princess",
            character1: "cannibal",
            character2: "princess",
            description: "如果食人族提名并处决了公主且公主因此死亡，当晚恶魔不会造成死亡。"
        }
    ],

    // === Alchemist ===
    "alchemist": [
        {
            id: "alchemist_spy",
            character1: "alchemist",
            character2: "spy",
            description: "如果炼金术士本应获得间谍的能力，那么他不会拥有该能力并改为间谍一定在场。每次处决后，存活的炼金术士可以公开猜测一名存活玩家是间谍：如果猜对了，恶魔今晚必须选择间谍。"
        },
        {
            id: "alchemist_widow",
            character1: "alchemist",
            character2: "widow",
            description: "如果炼金术士本应获得寡妇的能力，那么他不会拥有该能力并改为寡妇一定在场。每次处决后，存活的炼金术士可以公开猜测一名存活玩家是寡妇：如果猜对了，恶魔今晚必须选择寡妇。"
        },
        {
            id: "alchemist_wraith",
            character1: "alchemist",
            character2: "wraith",
            description: "如果炼金术士本应获得亡魂的能力，那么他不会拥有该能力并改为亡魂一定在场。每次处决后，存活的炼金术士可以公开猜测一名存活玩家是亡魂：如果猜对了，恶魔当晚必须选择亡魂。"
        },
        {
            id: "alchemist_summoner", // 召唤师
            character1: "alchemist",
            character2: "summoner",
            description: "获得召唤师能力的炼金术士不会获得伪装。他要选择一个恶魔角色，但不选择玩家，由说书人决定哪一名玩家变成邪恶的恶魔。如果他在选择之前死亡，邪恶阵营获胜。[无恶魔在场]"
        },
        {
            id: "alchemist_organ_grinder",
            character1: "alchemist",
            character2: "organ_grinder",
            description: "如果炼金术士获得街头风琴手的能力，街头风琴手一定在场。如果炼金术士和街头风琴手都是清醒的，改为他们都醉酒。"
        },
        {
            id: "alchemist_marionette",
            character1: "alchemist",
            character2: "marionette",
            description: "如果炼金术士本应获得提线木偶的能力，那么他不会拥有该能力并改为提线木偶一定在场。"
        },
        {
            id: "alchemist_mastermind",
            character1: "alchemist",
            character2: "mastermind",
            description: "如果炼金术士本应获得主谋的能力，那么他不会拥有该能力并改为主谋一定不在场。"
        }
    ],

    // === Magician (Magic) ===
    "magician": [
        {
            id: "magician_legion",
            character1: "magician",
            character2: "legion",
            description: "魔术师会和军团一同被唤醒，并可能被当作邪恶阵营。军团会知道魔术师是否在场，但不会得知具体是哪一名玩家。"
        },
        {
            id: "magician_marionette",
            character1: "magician",
            character2: "marionette",
            description: "如果魔术师存活，恶魔不会得知谁是提线木偶。"
        },
        {
            id: "magician_vizier",
            character1: "magician",
            character2: "vizier",
            description: "如果维齐尔在场，魔术师不会拥有能力，但他会免疫维齐尔的能力。"
        },
        {
            id: "magician_wraith", // 亡魂
            character1: "magician",
            character2: "wraith",
            description: "每次处决后，存活的魔术师可以公开猜测一名存活玩家是亡魂：如果猜对了，恶魔当晚必须选择亡魂。"
        },
        {
            id: "magician_spy",
            character1: "magician",
            character2: "spy",
            description: "当间谍查看魔典时，魔术师和恶魔的角色标记会被说书人移除。"
        },
        {
            id: "magician_widow",
            character1: "magician",
            character2: "widow",
            description: "当寡妇查看魔典时，魔术师和恶魔的标记会被说书人移除。"
        },
        {
            id: "magician_lilmonsta",
            character1: "magician",
            character2: "lilmonsta",
            description: "如果魔术师存活，由说书人决定谁照看小怪宝。"
        }
    ],

    // === Spy ===
    "spy": [
        {
            id: "spy_poppy_grower",
            character1: "spy",
            character2: "poppy_grower",
            description: "如果罂粟种植者在场，直到其死亡前间谍无法查看魔典。"
        },
        {
            id: "spy_damsel",
            character1: "spy",
            character2: "damsel",
            description: "如果间谍正在场或曾经在场，落难少女中毒。"
        },
        {
            id: "spy_heretic",
            character1: "spy",
            character2: "heretic",
            description: "异端分子会被间谍当作一个不在场的外来者，异端分子会知道是哪个外来者。"
        },
        {
            id: "spy_ogre",
            character1: "spy",
            character2: "ogre",
            description: "间谍必定被食人魔当作邪恶阵营。"
        },
        {
            id: "spy_alchemist",
            character1: "spy",
            character2: "alchemist",
            description: "（同炼金术士）如果炼金术士本应获得间谍的能力，改为间谍一定在场..."
        }
    ],

    // === Widow ===
    "widow": [
        {
            id: "widow_poppy_grower",
            character1: "widow",
            character2: "poppy_grower",
            description: "如果罂粟种植者在场，直到其死亡前寡妇无法查看魔典。寡妇会在罂粟种植者死后的首个夜晚触发自身的能力。"
        },
        {
            id: "widow_damsel",
            character1: "widow",
            character2: "damsel",
            description: "如果寡妇正在场或曾经在场，落难少女中毒。"
        },
        {
            id: "widow_heretic",
            character1: "widow",
            character2: "heretic",
            description: "异端分子会被寡妇当作一个不在场的外来者，异端分子会知道是哪个外来者。"
        }
    ],

    // === Marionette (Puppet) ===
    "marionette": [
        {
            id: "marionette_lilmonsta",
            character1: "marionette",
            character2: "lilmonsta",
            description: "提线木偶会与一名爪牙玩家邻座，而不是恶魔。提线木偶不会被唤醒来决定是否照看小怪宝，也不会在照看小怪宝时得知自己是提线木偶。"
        },
        {
            id: "marionette_poppy_grower",
            character1: "marionette",
            character2: "poppy_grower",
            description: "当罂粟种植者死亡后，恶魔会知道谁是提线木偶，但提线木偶什么都不会知道。"
        },
        {
            id: "marionette_snitch",
            character1: "marionette",
            character2: "snitch",
            description: "提线木偶不会得知三个不在场的角色，如果提线木偶与告密者均在场，改为由恶魔额外得知三个不在场角色。"
        },
        {
            id: "marionette_balloonist",
            character1: "marionette",
            character2: "balloonist",
            description: "如果提线木偶抽到了气球驾驶员，也可能会+1外来者。"
        },
        {
            id: "marionette_damsel",
            character1: "marionette",
            character2: "damsel",
            description: "提线木偶不会得知落难少女在场。"
        },
        {
            id: "marionette_huntsman",
            character1: "marionette",
            character2: "huntsman",
            description: "如果提线木偶抽到了巡山人，也会增加落难少女。"
        },
        {
            id: "marionette_wraith",
            character1: "marionette",
            character2: "wraith",
            description: "亡魂不会和提线木偶一同被唤醒。"
        }
    ],

    // === Pit-Hag (Masquerade) ===
    "pit_hag": [
        {
            id: "pit_hag_heretic",
            character1: "pit_hag",
            character2: "heretic",
            description: "麻脸巫婆无法创造异端分子。"
        },
        {
            id: "pit_hag_damsel",
            character1: "pit_hag",
            character2: "damsel",
            description: "如果麻脸巫婆创造了落难少女，改为由说书人来决定哪一名玩家变成落难少女。"
        },
        {
            id: "pit_hag_politician",
            character1: "pit_hag",
            character2: "politician",
            description: "被麻脸巫婆创造的邪恶政客无法因为自身能力转变为善良阵营。"
        }
        // ... Add others like cult_leader, goon, ogre
    ],

    // === Plague Doctor ===
    "plague_doctor": [
        {
            id: "plague_doctor_baron",
            character1: "plague_doctor",
            character2: "baron",
            description: "如果说书人获得的男爵的能力，改为至多两名玩家会变成外来者。"
        },
        {
            id: "plague_doctor_spy",
            character1: "plague_doctor",
            character2: "spy",
            description: "如果瘟疫医生死亡且说书人会因此获得间谍的能力，改为一名存活的爪牙玩家获得此能力，且他会得知此事。"
        }
        // ... Add others (bomb, evil twin, fearmonger, goblin, scarlet woman, widow, wraith...)
    ],

    // === Vizier ===
    "vizier": [
        {
            id: "vizier_investigator",
            character1: "vizier",
            character2: "investigator",
            description: "说书人不会宣布维齐尔在场。如果调查员的能力使其得知了维齐尔，则说书人不会告知所有人维齐尔在场。"
        },
        {
            id: "vizier_preacher",
            character1: "vizier",
            character2: "preacher",
            description: "如果维齐尔失去能力，他会得知这一信息。如果传教士在剧本列表中，且维齐尔在具有能力时被处决，他的阵营获胜。"
        },
        {
            id: "vizier_magician",
            character1: "vizier",
            character2: "magician",
            description: "如果维齐尔和魔术师都在场，恶魔不会得知谁是爪牙。"
        }
    ],

    // === Riot (Baoluan) ===
    "riot": [
        {
            id: "riot_exorcist",
            character1: "riot",
            character2: "exorcist",
            description: "如果暴乱提名并处决了驱魔人上个夜晚选择的那名玩家，善良阵营获胜。"
        },
        {
            id: "riot_mayor",
            character1: "riot",
            character2: "mayor",
            description: "镇长可以停止暴乱的提名链。如果他这样做了，并且场上只有一名暴乱存活，善良阵营获胜；否则，邪恶阵营获胜。"
        }
    ],

    // === Leviathan ===
    "leviathan": [
        {
            id: "leviathan_exorcist",
            character1: "leviathan",
            character2: "exorcist",
            description: "如果利维坦提名并处决了驱魔人选择的那名玩家，善良阵营获胜。"
        },
        {
            id: "leviathan_mayor",
            character1: "leviathan",
            character2: "mayor",
            description: "如果利维坦和镇长在第五天存活且没有处决发生，善良阵营获胜。"
        }
    ]
};

// Also index key by reversed order to ensure bidirectional lookup
Object.keys(JINX_RULES).forEach(key => {
    JINX_RULES[key].forEach(rule => {
        if (!JINX_RULES[rule.character2]) {
            JINX_RULES[rule.character2] = [];
        }
        if (!JINX_RULES[rule.character2].find(r => r.id === rule.id)) {
            JINX_RULES[rule.character2].push(rule);
        }
    });
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
