import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 教授 (Professor)
 * 说明：每局游戏限一次，你可以在夜晚选择一名已死亡的善良玩家：他立刻复活。
 */
export const professor: RoleDefinition = {
  id: "professor",
  name: "教授",
  type: "townsfolk",
  detailedDescription: `【背景故事】
“过程很简单。将液压植入器连接到改良型气矩阵放大器上，加入20CC的伪多拉芬，让他的参数Z保持在20%以上，你丈夫就会重新活蹦乱跳。
现在，我们需要的仅仅是一次雷击。”
【角色能力】
每局游戏限一次，在夜晚时*，你可以选择一名死亡的玩家：如果他是镇民，你会将他起死回生。
【角色简介】
教授能让死者重获新生。
- 每局游戏限一次，教授可以选择一名已死亡的玩家。如果该玩家是镇民，他将被复活，再次变成存活状态。
- 如果教授选择了外来者、爪牙或恶魔，则无事发生，并且教授失去自己的能力。
- 复活的玩家会重新获得自己的能力，即使是已经使用过的“每局游戏限一次”的能力也会重新获得。
- 复活的镇民能不能在自己复活的当晚进行行动，取决于复活的镇民本该在教授之前还是之后行动。如果复活的镇民有“在你的首个夜晚”的能力，则会在教授重新入睡后立即被唤醒来使用这类能力。
【范例】
> 范例: 教授选择了一名声称自己是茶艺师的已死亡玩家。该玩家实际上是疯子。无人被复活。
> 范例: 教授复活了祖母，祖母得知了一名善良玩家的角色。在黎明，所有玩家都得知这名祖母玩家复活了，但是并不知道该玩家是祖母。
> 范例: 醉酒的教授选择复活吟游诗人。教授不得而知的是，当晚沙巴洛斯反刍了吟游诗人，他现在已经是存活状态。说书人摇头表示不行，因为教授必须选择一名已死亡的玩家。教授改为选择了已死亡的弄臣。因为教授醉酒，无事发生，并且教授不能再次使用自己的能力。
【运作方式】
除首夜以外的夜晚，唤醒教授。教授要么摇头表示不使用能力，要么指向一名已死亡的玩家。让教授重新入睡。
如果教授选择了一名已死亡的镇民，所选玩家再次变成存活状态——将教授的“复活”提示标记放置到该玩家的角色标记旁，并移除其帷幕标记。（如果被复活的玩家其角色在当晚的后续时段中应该被唤醒，则照常唤醒。如果该玩家的角色只会在首个夜晚被唤醒，则立即唤醒该玩家来使用自己的能力。）黎明时，在宣布哪些玩家死亡后，宣布哪些玩家再次变成存活状态了。（不要说明原因。）教授失去自己的能力——将“失去能力”提示标记放置到教授的角色标记旁，并从夜晚顺序表上移除其夜晚标记。
【提示标记】
- 复活
放置时机：在教授夜晚行动时选择使用能力，并选择了一名已死亡的玩家后。
放置条件：如果在被教授选择时，该玩家的角色类型是镇民，且教授未醉酒中毒，则在该玩家的角色标记旁放置，用以提醒说书人在黎明时分宣布当晚的复活玩家。
移除时机：在黎明时宣布复活玩家后，说书人可以任由自己方便来进行移除。
- 失去能力
放置时机：在教授夜晚行动时选择使用能力，并选择了一名已死亡的玩家后。
放置条件：只要教授选择了已死亡玩家，不论教授是否醉酒中毒，都会将此标记放置在教授角色标记旁。
移除时机：教授死亡或离场时。

【提示与技巧】
- 尽可能早地使用你的能力！邪恶的玩家真的不想让你活着，所以尽快触发你的能力会给你带来优势。此外，在游戏早期死亡的玩家更有可能是善良的镇民，因为他们占多数，而邪恶方会互相保护。
- 也可以在游戏后期使用你的能力！虽然有风险，但在游戏快结束时，复活善良镇民对邪恶阵营玩家极有破坏性。善良阵营玩家将能够在你和你复活的镇民周围团结起来，而邪恶阵营玩家更难伪装自己，因为游戏已经到了后期。
- 请记住，如果你的能力失败，死去的玩家要么是邪恶的，要么是外来者。不要马上下结论——你可能已经选中了一个僵怖或困惑的疯子！
- 复活夜晚死亡的玩家，而不是被处决的玩家。晚上死去的玩家，更可能是善良的。
- 如果你认为白天的处决犯了错误，请复活被处决的玩家！如果你的能力有效，你就救活了一个无辜的镇民。如果不是，那么你可以非常确定他们第一次执行它们是正确的。 （策略：向你认为善良的玩家展示自己的角色，并要求他们被故意处决，这样你就可以把他们带回来，证明你们俩。这在游戏早期尤其有效！）
- 成功复活一个镇民，你将成为游戏中更值得信赖的善良玩家之一。虽然你仍可能被怀疑（沙巴洛斯始终是一个问题），但你和你复活的镇民可以互相信任，并且大多数其他玩家会想加入你们！利用这个优势，面对邪恶阵营团结善良阵营玩家。
- 在选择复活谁时，请提前告诉玩家你打算做什么。这不仅为你不是沙巴洛斯的事实提供了可信度（因为说书人可以选择谁被反刍），而且这也意味着如果他们是一个出于任何原因以镇民角色虚张声势的外来者，他们可以提醒你。此外，如果有些玩家同意执行此计划，但是没有复活成功，那你可以怀疑他们是邪恶的。
【伪装成教授】
当你要伪装成教授的时候，这里有几件事你应该记住：
- 你不能复活任何人。准备好解释你的能力失败的原因。教授通常比黯月初升剧本中的其他善良角色更难虚张声势，所以你需要提前考虑。
- 声称在别的玩家认为可疑的玩家身上使用了你的教授能力。你可以声称想要“测试”以查看他们是否真的是镇民。选择一个可疑的玩家更有可能让你看起来像个善良玩家，所以如果你是一个恶魔而不是一个爪牙，那么这个方法会更有用。
- 声称在值得信赖的善良玩家身上使用了你的能力。当什么都没有发生时，小组会假设（除非你能说服他们你因为某种原因醉酒或中毒了）你们中的一个是邪恶的。很可能的是那名玩家是受信任的，而你不是。如果你是一个爪牙，这个策略会更有用，因为被处决通常是一件好事。
- 如果恶魔是沙巴洛斯，而玩家在夜晚被反刍，这可能看起来与教授复活某人相同。如果你认为这可能会发生，或者如果你机智敏捷并且可以在早上声称昨晚的被复活的玩家是由于你的能力，你可以说服别的玩家你有效地使用了你的能力。如果反刍的玩家实际上是爪牙，这将造成双重破坏。
- 如果你是一名善良的玩家，自称教授并且已经使用自己的能力（但没有发生任何事情），可能是保持足够长的生命以使用你的实际能力的好方法。恶魔通常对攻击失去能力的教授不感兴趣，因为他们不再是威胁。例如，如果你是侍臣，但想确保你能活到足够长的时间来确保你的能力没有中毒，那么声称自己不再有能力的教授通常会让你活得足够长。
【角色信息】
- 英文名：Professor
- 所属剧本：黯月初升
- 角色类型：镇民
- 角色能力类型：复活、限次能力
NewPP limit report
Cached time: 20260119174754
Cache expiry: 86400
Reduced expiry: false
Complications: []
CPU time usage: 0.031 seconds
Real time usage: 0.051 seconds
Preprocessor visited node count: 63/1000000
Post‐expand include size: 0/2097152 bytes
Template argument size: 0/2097152 bytes
Highest expansion depth: 2/40
Expensive parser function count: 0/100
Unstrip recursion depth: 0/20
Unstrip post‐expand size: 0/5000000 bytes
Transclusion expansion time report (%,ms,calls,template)
100.00%    0.000      1 -total
Saved in parser cache with key gstone_wiki:pcache:idhash:20-0!canonical and timestamp 20260119174754 and revision id 5030. Serialized with JSON.`,
  clarifications: [
    "如果在城镇广场上没有死亡玩家，则无需唤醒教授（即使可能已经有人死亡，但还未被说书人告知）。侍女也不会因此检测到教授因为自身能力被唤醒。",
    "相克规则（与华灯系列角色）：狸猫：如果狸猫与使用过能力的教授交换角色，新教授仍然失去能力。",
  ],

  night: {
    order: (isFirstNight) => (isFirstNight ? 0 : 14),

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (isFirstNight) {
        return {
          wake: "",
          instruction: "",
          close: "",
        };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（教授）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（教授），请闭眼。`,
      };
    },

    handler: (context) => {
      const { selfId, targets, seats, helpers } = context;

      if (!helpers) return null;

      // 检查是否已使用能力
      if (helpers.hasUsedAbility("professor", selfId)) {
        return {
          updates: [],
          logs: { privateLog: "你已经使用过复活能力了" },
        };
      }

      if (targets.length !== 1) {
        return {
          updates: [],
          logs: { privateLog: "请选择一名死亡的玩家进行复活" },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);

      if (!targetSeat || !targetSeat.isDead) {
        return {
          updates: [],
          logs: { privateLog: "只能选择死亡的玩家" },
        };
      }

      // 获取其实际角色（处理醉酒/洗脑影响的情况）
      const actualRole =
        targetSeat.role?.id === "drunk"
          ? targetSeat.charadeRole
          : targetSeat.role;

      // 成功条件：目标是镇民且不是恶魔继任者
      const isSuccess =
        actualRole?.type === "townsfolk" && !targetSeat.isDemonSuccessor;

      if (isSuccess) {
        // 复活逻辑
        helpers.setSeats((prev) =>
          prev.map((s) => {
            if (s.id !== targetId) return s;
            return helpers.reviveSeat({
              ...s,
              isEvilConverted: false, // 复活后回归原本阵营（通常是善良）
            });
          })
        );

        helpers.addLog(
          `🎓 ${selfId + 1}号(教授) 复活了 ${targetId + 1}号(${actualRole?.name})`
        );

        // 如果该角色 tonight 还没醒过且在教授之后，加入队列
        helpers.insertIntoWakeQueueAfterCurrent(targetId, {
          logLabel: `${targetId + 1}号(复活)`,
        });
      } else {
        helpers.addLog(
          `🎓 ${selfId + 1}号(教授) 尝试复活 ${targetId + 1}号，但失败了（非镇民或由于其他原因）`
        );
      }

      // 无论成功与否，一旦执行行动（点击确认），都标记为已使用
      helpers.markAbilityUsed("professor", selfId);

      return {
        updates: [],
      };
    },
  },
};
