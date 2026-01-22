/**
 * 清理模拟测试日志文件的工具脚本
 * 
 * 功能：
 * 1. 删除指定剧本的测试结果（用于测试启动时）
 * 2. 删除所有测试结果（用于项目启动时）
 */

const fs = require('fs');
const path = require('path');

const SIMULATION_LOGS_DIR = path.join(__dirname, 'simulation_logs');

/**
 * 删除指定目录下的所有文件
 */
function deleteDirectoryContents(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { deleted: 0, errors: [] };
  }

  let deleted = 0;
  const errors = [];

  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      try {
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          // 递归删除子目录
          const result = deleteDirectoryContents(itemPath);
          deleted += result.deleted;
          errors.push(...result.errors);
          // 删除空目录
          fs.rmdirSync(itemPath);
        } else {
          // 删除文件
          fs.unlinkSync(itemPath);
          deleted++;
        }
      } catch (err) {
        errors.push({ path: itemPath, error: err.message });
      }
    }
  } catch (err) {
    errors.push({ path: dirPath, error: err.message });
  }

  return { deleted, errors };
}

/**
 * 清理指定剧本的测试结果
 * @param {string} scriptName - 剧本名称（如 'trouble_brewing', 'bad_moon_rising' 等）
 * @returns {Object} 清理结果
 */
function cleanScriptLogs(scriptName) {
  const scriptDir = path.join(SIMULATION_LOGS_DIR, scriptName);
  const result = deleteDirectoryContents(scriptDir);
  
  if (fs.existsSync(scriptDir)) {
    try {
      fs.rmdirSync(scriptDir);
    } catch (err) {
      // 目录可能不为空，忽略错误
    }
  }
  
  return result;
}

/**
 * 清理所有测试结果
 * @returns {Object} 清理结果
 */
function cleanAllLogs() {
  const result = deleteDirectoryContents(SIMULATION_LOGS_DIR);
  
  if (fs.existsSync(SIMULATION_LOGS_DIR)) {
    try {
      fs.rmdirSync(SIMULATION_LOGS_DIR);
    } catch (err) {
      // 目录可能不为空，忽略错误
    }
  }
  
  return result;
}

/**
 * 剧本名称映射（从测试文件名到日志目录名）
 */
const SCRIPT_NAME_MAP = {
  'trouble_brewing': 'trouble_brewing',
  'bad_moon_rising': 'bad_moon_rising',
  'sects_violets': 'sects_violets',
  'midnight_revelry': 'midnight_revelry',
  'all_roles': 'all_roles',
};

// 如果直接运行此脚本，清理所有日志
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0] !== '--all') {
    // 清理指定剧本
    const scriptName = args[0];
    const logDirName = SCRIPT_NAME_MAP[scriptName] || scriptName;
    console.log(`正在清理 ${logDirName} 的测试结果...`);
    const result = cleanScriptLogs(logDirName);
    console.log(`已删除 ${result.deleted} 个文件/目录`);
    if (result.errors.length > 0) {
      console.warn(`警告：${result.errors.length} 个文件删除失败`);
      result.errors.forEach(err => {
        console.warn(`  - ${err.path}: ${err.error}`);
      });
    }
  } else {
    // 清理所有日志
    console.log('正在清理所有测试结果...');
    const result = cleanAllLogs();
    console.log(`已删除 ${result.deleted} 个文件/目录`);
    if (result.errors.length > 0) {
      console.warn(`警告：${result.errors.length} 个文件删除失败`);
      result.errors.forEach(err => {
        console.warn(`  - ${err.path}: ${err.error}`);
      });
    }
  }
}

module.exports = {
  cleanScriptLogs,
  cleanAllLogs,
  SCRIPT_NAME_MAP,
};

