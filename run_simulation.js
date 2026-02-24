// run_simulation.js

const { exec } = require("child_process");
const readline = require("readline");

const scripts = [
  "暗流涌动",
  "黯月初升",
  "梦殒春宵",
  "夜半狂欢",
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("请选择要测试的剧本:");
scripts.forEach((script, index) => {
  console.log(`${index + 1}: ${script}`);
});
console.log("--------------------");

rl.question("请输入选项编号 (1-4): ", (answer) => {
  const choice = parseInt(answer, 10);
  if (isNaN(choice) || choice < 1 || choice > scripts.length) {
    console.log("无效的选项，请输入 1 到 4 之间的数字。");
    rl.close();
    return;
  }

  const selectedScript = scripts[choice - 1];
  console.log(`\n您选择了: ${selectedScript}`);
  console.log("正在启动 Playwright 进行游戏模拟...");
  console.log("浏览器窗口将自动打开，请勿操作，测试结束后会自动关闭。\n");

  // 设置环境变量并执行测试
  const command = `cross-env SCRIPT_NAME="${selectedScript}" npx playwright test tests/advanced_simulation.spec.ts --headed`;

  const playwrightProcess = exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`\n--- Playwright 执行出错 ---\n`);
      console.error(error.message);
    }
    if (stderr) {
        // Playwright 经常在 stderr 中输出正常信息，只显示关键错误
        if(stderr.includes('Error:')) {
            console.error(`\n--- Playwright Stderr ---\n`);
            console.error(stderr);
        }
    }
  });

  playwrightProcess.stdout.pipe(process.stdout);
  playwrightProcess.stderr.pipe(process.stderr);

  playwrightProcess.on("close", (code) => {
    console.log("\n----------------------------------------");
    console.log("测试运行结束。");
    console.log("详细日志报告已生成: simulation_report.txt");
    console.log("----------------------------------------");
    rl.close();
  });
});

// 需要安装 cross-env
// npm install --save-dev cross-env
