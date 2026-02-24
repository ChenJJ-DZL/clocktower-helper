const { execSync } = require('child_process');

async function main() {
  const inquirer = (await import('inquirer')).default;

  const scripts = ['TROUBLE_BREWING', 'SECTS_AND_VIOLETS', 'BAD_MOON_RISING'];

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'script',
      message: '请选择要测试的剧本:',
      choices: scripts,
    },
  ]);

  const selectedScript = answers.script;
  console.log(`你选择了: ${selectedScript}`);
  console.log('正在准备启动 Playwright 测试...');

  // execSync(
  //   `npx playwright test tests/custom_e2e_simulation.spec.ts --headed`,
  //   { stdio: 'inherit' }
  // );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
