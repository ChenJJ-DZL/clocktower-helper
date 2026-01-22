/**
 * 检查测试中覆盖了哪些角色
 * 运行：node tests/check_role_coverage.js
 */

const { roles } = require('../app/data.ts');

// 从测试文件中提取已实现的角色ID
const implementedRoles = new Set([
  // 夜晚行动角色
  'poisoner',
  'poisoner_mr',
  'monk',
  'innkeeper',
  'fortune_teller',
  'investigator',
  'washerwoman',
  'librarian',
  'chef',
  'empath',
  // 被动角色（在代码中提及）
  'tea_lady',
  'soldier',
  'drunk',
  // 恶魔（通用处理）
  'imp', // 和其他恶魔类型
]);

// 获取暗流涌动剧本的所有角色
const troubleBrewingRoles = roles.filter(r => 
  (r.script === '暗流涌动' || !r.script) && 
  !r.hidden
);

// 按类型分组
const byType = {
  townsfolk: [],
  outsider: [],
  minion: [],
  demon: [],
};

troubleBrewingRoles.forEach(role => {
  if (byType[role.type]) {
    byType[role.type].push(role);
  }
});

console.log('='.repeat(80));
console.log('角色覆盖情况检查');
console.log('='.repeat(80));
console.log('');

// 检查每个类型的覆盖情况
Object.entries(byType).forEach(([type, roles]) => {
  const typeName = {
    townsfolk: '镇民',
    outsider: '外来者',
    minion: '爪牙',
    demon: '恶魔',
  }[type] || type;
  
  console.log(`## ${typeName} (${roles.length}个)`);
  console.log('');
  
  const implemented = [];
  const notImplemented = [];
  
  roles.forEach(role => {
    // 检查是否实现（包括部分实现）
    const isImplemented = implementedRoles.has(role.id) ||
      (type === 'demon' && role.type === 'demon'); // 恶魔有通用处理
    
    if (isImplemented) {
      implemented.push(role);
    } else {
      notImplemented.push(role);
    }
  });
  
  if (implemented.length > 0) {
    console.log('✅ 已实现/部分实现:');
    implemented.forEach(r => {
      const status = implementedRoles.has(r.id) ? '✅ 完整' : '⚠️  部分';
      console.log(`  ${status} - ${r.name} (${r.id})`);
    });
    console.log('');
  }
  
  if (notImplemented.length > 0) {
    console.log('❌ 未实现:');
    notImplemented.forEach(r => {
      console.log(`  ❌ ${r.name} (${r.id})`);
    });
    console.log('');
  }
  
  const coverage = ((implemented.length / roles.length) * 100).toFixed(1);
  console.log(`覆盖率: ${implemented.length}/${roles.length} (${coverage}%)`);
  console.log('');
});

// 统计总体情况
const totalRoles = troubleBrewingRoles.length;
const totalImplemented = troubleBrewingRoles.filter(r => 
  implementedRoles.has(r.id) || r.type === 'demon'
).length;
const totalCoverage = ((totalImplemented / totalRoles) * 100).toFixed(1);

console.log('='.repeat(80));
console.log('总体统计');
console.log('='.repeat(80));
console.log(`总角色数: ${totalRoles}`);
console.log(`已实现/部分实现: ${totalImplemented}`);
console.log(`未实现: ${totalRoles - totalImplemented}`);
console.log(`总体覆盖率: ${totalCoverage}%`);
console.log('');

// 列出所有未实现的角色及其能力
console.log('='.repeat(80));
console.log('未实现角色详情');
console.log('='.repeat(80));
console.log('');

troubleBrewingRoles.forEach(role => {
  const isImplemented = implementedRoles.has(role.id) || role.type === 'demon';
  if (!isImplemented) {
    console.log(`${role.name} (${role.id})`);
    console.log(`  类型: ${role.type}`);
    console.log(`  能力: ${role.ability || '无描述'}`);
    console.log('');
  }
});

