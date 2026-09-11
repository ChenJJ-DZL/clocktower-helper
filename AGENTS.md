# AGENTS.md · 仓库协作约定

> 本文件记录本项目的长期工作约定。改动代码前请先读这一页。

## 仓库结构

| 位置 | 说明 |
|---|---|
| 仓库根目录 | Next.js 主应用(clocktower-helper) |
| test_automation/ | Git 子模块,E2E / 自动化测试(clocktower-helper-test-automation) |

---

## 1. 临时测试脚本:不提交,验证无误后立即删除

- **不上传**:为验证某轮修改而临时写的脚本,一律不 `git add`、不提交、不推送。范围包括根目录下的 `test_*.js`、`test_*.ts`、`debug_*.js`、`diag_*.js`、`check_*.js`、`capture_*.js`、`screenshot_*.js`、`e2e_*.js`、`tmp_*.js`,以及 `test_automation/` 下的同类脚本。
- **每轮删**:确认该轮修改无误后,立即删除这批临时脚本,让 `git status` 回到干净状态。
- **例外**:仓库内的正式测试套件属于项目资产,正常提交维护,不适用本条 —— 例如 `src/**/__tests__/**`、`test_automation/e2e/**`。
- **兜底**:两个仓库的 `.git/info/exclude` 已写入上述脚本模式的本地忽略规则(纯本地文件,永不提交),避免 `git add -A` 把临时脚本卷进提交。

## 2. 忽略类产物(截图 / 日志等):满 30 天即可清理

- **对象**:永远进不了仓库、也不影响与 GitHub 同步的测试产物 —— 测试截图、运行日志、临时输出。例如根目录的 `screenshots/`、`playwright-report/`、`test-results/`、`dev_server_*.log`、`debug.log`,以及 `test_automation/` 下的 `*.png`、`*.log`、`*.txt`。
- **规则**:最后修改时间**超过 30 天**即可删除;未满 30 天的一律保留,便于回溯。
- **前置检查**:删除前确认该文件没有被任何进程占用(被占用则跳过);不要使用 `git clean -x` 之类一把梭的命令。

### 保护清单:以下内容永不清理

`node_modules/`、`.next/`、`next-env.d.ts`、`tsconfig.tsbuildinfo`、`.env*` —— 它们虽然同样是忽略文件,但属于构建 / 运行必需品,不适用 30 天规则。

## 3. 子模块注意事项

- 提交子模块内容前,先用 `git -C test_automation ls-remote origin` 确认远程可用;若远程不可访问时提交,会产生一个父仓库无法解析的 gitlink,反而破坏仓库的可克隆性。
- 子模块内只做本地验证,不提交、不推送。

## 4. 同步要求

任何工作收尾时都应保证:本地 `main` 与 GitHub `origin/main` 完全一致。

- `git status` 应当干净(无未跟踪的临时脚本、无未提交改动)。
- `git rev-list --left-right --count origin/main...main` 应当输出 `0	0`。
