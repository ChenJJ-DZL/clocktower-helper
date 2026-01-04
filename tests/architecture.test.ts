import { roleRegistry, getRoleDefinition } from '../src/roles/index';
import { monk } from '../src/roles/townsfolk/monk';
import { Seat } from '../src/types/game';
import { NightActionContext } from '../src/types/roleDefinition';
import { Role } from '../src/types/game';

// 辅助函数：创建简化的 Role mock 数据
const createMockRole = (id: string, name: string, type: 'townsfolk' | 'outsider' | 'minion' | 'demon'): Role => {
  return {
    id,
    name,
    type,
    ability: '',
    fullDescription: '',
    firstNight: false,
    otherNight: false,
    firstNightOrder: 0,
    otherNightOrder: 0,
    firstNightReminder: '',
    otherNightReminder: '',
  } as Role;
};

// 辅助函数：创建简化的 Seat mock 数据
const createMockSeat = (id: number, roleId: string, roleName: string, roleType: 'townsfolk' | 'outsider' | 'minion' | 'demon', overrides: Partial<Seat> = {}): Seat => {
  const role = createMockRole(roleId, roleName, roleType);
  
  return {
    id,
    playerName: `玩家${id + 1}`,
    role,
    charadeRole: null,
    isDead: false,
    hasGhostVote: false,
    isEvilConverted: false,
    isGoodConverted: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    statusDetails: [],
    statuses: [],
    voteCount: 0,
    isCandidate: false,
    grandchildId: null,
    isGrandchild: false,
    isFirstDeathForZombuul: false,
    isZombuulTrulyDead: false,
    zombuulLives: 0,
    ...overrides,
  } as Seat;
};

describe('新架构核心验证', () => {
  // 1. 验证注册表是否正常工作
  test('角色注册表应包含僧侣', () => {
    const monkDef = roleRegistry.get('monk');
    expect(monkDef).toBeDefined();
    expect(monkDef?.name).toBe('僧侣');
    expect(monkDef?.id).toBe('monk');
    expect(monkDef?.type).toBe('townsfolk');
  });

  // 2. 验证 getRoleDefinition 辅助函数
  test('getRoleDefinition 应能正确获取角色定义', () => {
    const monkDef = getRoleDefinition('monk');
    expect(monkDef).toBeDefined();
    expect(monkDef?.name).toBe('僧侣');
    
    // 测试不存在的角色
    const nonExistent = getRoleDefinition('non_existent_role');
    expect(nonExistent).toBeUndefined();
  });

  // 3. 验证僧侣的逻辑函数 (Handler)
  test('僧侣技能应能正确生成保护状态', () => {
    // 模拟 3 个座位
    const mockSeats: Seat[] = [
      createMockSeat(0, 'monk', '僧侣', 'townsfolk'),
      createMockSeat(1, 'washerwoman', '洗衣妇', 'townsfolk'),
      createMockSeat(2, 'imp', '小恶魔', 'demon'),
    ];

    // 获取僧侣的处理器
    const handler = monk.night?.handler;
    if (!handler) {
      throw new Error("僧侣缺少 Handler 定义");
    }

    // 模拟：0号(僧侣) 保护 1号
    const context: NightActionContext = {
      seats: mockSeats,
      selfId: 0,
      targets: [1],
      gamePhase: 'night',
      nightCount: 1,
    };

    const result = handler(context);

    // 断言：结果中应该包含对 1号 的状态更新
    const targetUpdate = result.updates.find(u => u.id === 1);
    expect(targetUpdate).toBeDefined();
    
    // 检查更新内容是否包含保护状态
    expect(targetUpdate?.isProtected).toBe(true);
    expect(targetUpdate?.protectedBy).toBe(0);
    expect(targetUpdate?.statusDetails).toContain('僧侣保护');
    expect(targetUpdate?.statuses).toBeDefined();
    expect(targetUpdate?.statuses?.length).toBeGreaterThan(0);
    
    // 检查 statuses 中是否包含 Protected 效果
    const protectedStatus = targetUpdate?.statuses?.find(
      s => s.effect === 'Protected'
    );
    expect(protectedStatus).toBeDefined();
    expect(protectedStatus?.duration).toBe('至天亮');
    expect(protectedStatus?.sourceId).toBe(0);

    // 检查日志
    expect(result.logs.privateLog).toBeDefined();
    expect(result.logs.privateLog).toContain('僧侣（1号）保护了2号玩家');
  });

  // 4. 验证无效目标处理
  test('僧侣处理无效目标时应返回错误日志', () => {
    const mockSeats: Seat[] = [
      createMockSeat(0, 'monk', '僧侣', 'townsfolk'),
    ];

    const handler = monk.night?.handler;
    if (!handler) {
      throw new Error("僧侣缺少 Handler 定义");
    }

    // 测试：目标数量不正确
    const context1: NightActionContext = {
      seats: mockSeats,
      selfId: 0,
      targets: [], // 空目标
      gamePhase: 'night',
      nightCount: 1,
    };

    const result1 = handler(context1);
    expect(result1.updates).toHaveLength(0);
    expect(result1.logs.privateLog).toContain('未选择有效目标');

    // 测试：目标不存在
    const context2: NightActionContext = {
      seats: mockSeats,
      selfId: 0,
      targets: [999], // 不存在的目标
      gamePhase: 'night',
      nightCount: 1,
    };

    const result2 = handler(context2);
    expect(result2.updates).toHaveLength(0);
    expect(result2.logs.privateLog).toContain('选择了无效目标');
  });

  // 5. 验证其他已注册的角色
  test('注册表应包含所有已迁移的角色', () => {
    const expectedRoles = ['monk', 'washerwoman', 'librarian', 'investigator', 'chef', 'poisoner'];
    
    expectedRoles.forEach(roleId => {
      const roleDef = roleRegistry.get(roleId);
      expect(roleDef).toBeDefined();
      expect(roleDef?.id).toBe(roleId);
    });
  });
});

