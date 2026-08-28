import { describe, expect, it } from 'vitest';
import type { Seat } from '../../../../app/data';
import { runFullAbilityPipeline } from '../../../utils/middlewarePipeline';
import { chefAbility } from '../../new_engine/chef.ability';
import { empathAbility } from '../../new_engine/empath.ability';
import { fortuneTellerAbility } from '../../new_engine/fortune_teller.ability';
import { slayerAbility } from '../../new_engine/slayer.ability';

describe('陌客默认为邪恶，间谍默认为好人（除非说书人手动切换）', () => {
  const baseSeats = [
    {
      id: 0,
      role: { id: 'chef', name: '厨师', type: 'townsfolk' },
      isDead: false,
      isAlive: true,
    },
    {
      id: 1,
      role: { id: 'recluse', name: '陌客', type: 'outsider' },
      isDead: false,
      isAlive: true,
    },
    {
      id: 2,
      role: { id: 'imp', name: '小恶魔', type: 'demon' },
      isDead: false,
      isAlive: true,
    },
    {
      id: 3,
      role: { id: 'spy', name: '间谍', type: 'minion' },
      isDead: false,
      isAlive: true,
    },
    {
      id: 4,
      role: { id: 'empath', name: '共情者', type: 'townsfolk' },
      isDead: false,
      isAlive: true,
    },
  ];

  it('1. 厨师探查：陌客默认被当作邪恶，间谍默认被当作善良', async () => {
    const ctx = await (runFullAbilityPipeline as any)(chefAbility, {
      snapshot: { seats: baseSeats, nightCount: 1 } as any,
      actionNode: { roleId: 'chef', seatId: 0 } as any,
      meta: {},
    });
    expect(ctx.meta.abilityResult).toBe(1);
  });

  it('2. 厨师探查：说书人手动将陌客切换为善良后，陌客不再记为邪恶', async () => {
    const seatsWithGoodRecluse = baseSeats.map((s) =>
      s.id === 1 ? { ...s, registerAsEvil: false, registerAsDemon: false } : s
    );
    const ctx = await (runFullAbilityPipeline as any)(chefAbility, {
      snapshot: { seats: seatsWithGoodRecluse, nightCount: 1 } as any,
      actionNode: { roleId: 'chef', seatId: 0 } as any,
      meta: {},
    });
    expect(ctx.meta.abilityResult).toBe(0);
  });

  it('3. 厨师探查：说书人手动将间谍切换为邪恶后，间谍记为邪恶', async () => {
    const seatsWithEvilSpy = baseSeats.map((s) =>
      s.id === 3 ? { ...s, registerAsGood: false, registerAsEvil: true } : s
    );
    const ctx = await (runFullAbilityPipeline as any)(chefAbility, {
      snapshot: { seats: seatsWithEvilSpy, nightCount: 1 } as any,
      actionNode: { roleId: 'chef', seatId: 0 } as any,
      meta: {},
    });
    expect(ctx.meta.abilityResult).toBe(2);
  });

  it('4. 共情者探查：邻座陌客默认判定为邪恶', async () => {
    const ctx1 = await (runFullAbilityPipeline as any)(empathAbility, {
      snapshot: { seats: baseSeats, nightCount: 1 } as any,
      actionNode: { roleId: 'empath', seatId: 4 } as any,
      meta: {},
    });
    expect(ctx1.meta.abilityResult).toBe(0);

    const ctx2 = await (runFullAbilityPipeline as any)(empathAbility, {
      snapshot: { seats: baseSeats, nightCount: 1 } as any,
      actionNode: { roleId: 'empath', seatId: 0 } as any,
      meta: {},
    });
    expect(ctx2.meta.abilityResult).toBe(1);
  });

  it('5. 占卜师探查：陌客默认被当作恶魔（有），间谍默认被当作善良（没有）', async () => {
    const ctxRecluse = await (runFullAbilityPipeline as any)(fortuneTellerAbility, {
      snapshot: { seats: baseSeats, nightCount: 1 } as any,
      actionNode: { roleId: 'fortune_teller', seatId: 0 } as any,
      targetIds: [0, 1],
      meta: {},
    });
    expect(ctxRecluse.meta.abilityResult).toBe(true);

    const ctxSpy = await (runFullAbilityPipeline as any)(fortuneTellerAbility, {
      snapshot: { seats: baseSeats, nightCount: 1 } as any,
      actionNode: { roleId: 'fortune_teller', seatId: 0 } as any,
      targetIds: [0, 3],
      meta: {},
    });
    expect(ctxSpy.meta.abilityResult).toBe(false);
  });

  it('6. 狩魔人/杀手射击：陌客默认被当作恶魔可射杀，间谍默认不被射杀', async () => {
    const slayerSeats = [
      ...baseSeats,
      {
        id: 5,
        role: { id: 'slayer', name: '狩魔人', type: 'townsfolk' },
        isDead: false,
        isAlive: true,
      },
    ];

    const ctxSlayerRecluse = await (runFullAbilityPipeline as any)(slayerAbility, {
      snapshot: { seats: slayerSeats, nightCount: 1 } as any,
      actionNode: { roleId: 'slayer', seatId: 5 } as any,
      targetIds: [1],
      meta: { target: slayerSeats[1], isAbilityActive: true },
    });
    const killedRecluse = ctxSlayerRecluse.snapshot.seats.find((s: any) => s.id === 1);
    expect(killedRecluse?.isAlive).toBe(false);

    const ctxSlayerSpy = await (runFullAbilityPipeline as any)(slayerAbility, {
      snapshot: { seats: slayerSeats, nightCount: 1 } as any,
      actionNode: { roleId: 'slayer', seatId: 5 } as any,
      targetIds: [3],
      meta: { target: slayerSeats[3], isAbilityActive: true },
    });
    const aliveSpy = ctxSlayerSpy.snapshot.seats.find((s: any) => s.id === 3);
    expect(aliveSpy?.isAlive).toBe(true);
  });
});
