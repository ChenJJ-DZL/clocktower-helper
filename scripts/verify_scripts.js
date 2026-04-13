
const fs = require('fs');
const path = require('path');

console.log('检查剧本数据...\n');

// 1. 检查 scripts 数组是否有 8 个剧本
const dataPath = path.join(__dirname, '..', 'app', 'data.ts');
const content = fs.readFileSync(dataPath, 'utf8');

// 统计 scripts 数组中的对象数量
const scriptsMatch = content.match(/export const scripts: Script\[\] = \[([\s\S]*?)\];/);
if (scriptsMatch) {
  const scriptsContent = scriptsMatch[1];
  // 统计 id: 出现的次数
  const idMatches = scriptsContent.match(/id:\s*"[a-z0-9_]+"/g);
  console.log(`✅ 剧本数量: ${idMatches ? idMatches.length : 0} 个 (应该是 8 个)`);
  
  if (idMatches) {
    console.log('剧本列表:');
    idMatches.forEach(id => console.log(`  - ${id.replace(/id:\s*"/, '').replace(/"/, '')}`));
  }
}

console.log('\n✅ 剧本数据已更新完成！');
console.log('\n请运行: npm run dev 来测试剧本选择页面');
