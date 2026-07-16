# tests/

本目录于本次清理中清空了所有过期测试文件。

## 清理内容

- **Playwright E2E 测试** (`*.spec.ts`)：`full_game_v3`~`v7`、`debug_*`、`dusk_*`、`e2e_scenario_tb` 等——全部因架构变更失效。
- **Vitest 单元测试** (`*.test.ts`)：`architecture`、`role_coverage`、`poisoner_*`、`logic_core`、`tb_full_script` 等——全部因架构变更失效。
- **测试辅助脚本** (`*.ts`/`*.js`)：`headlessGameEngine`、`testHelpers`、`night_helper`、`simulation_helpers`、`tb_*.ts` 等。
- **调试产物** (`*.log`/`*.png`/`*.py`)：v7 诊断日志、截图、生成脚本等。

## 保留的测试框架

| 配置文件 | 用途 |
|---|---|
| `vitest.config.ts` | Vitest 单元测试框架（`passWithNoTests: true`） |
| `playwright.config.ts` | Playwright E2E 框架 |
| `jest.config.js` | Jest 备用框架 |

后续新建测试时直接放入本目录即可。
