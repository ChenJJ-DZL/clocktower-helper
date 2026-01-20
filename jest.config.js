// Jest 配置文件
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // 提供 Next.js 应用的路径，以便加载 next.config.js 和 .env 文件
  dir: './',
})

// 添加任何自定义配置到传递给 createJestConfig 的下一个 Jest
const customJestConfig = {
  // 如果使用 TypeScript，需要设置 preset
  preset: 'ts-jest',
  
  // 测试环境：node 用于后端逻辑测试，jsdom 用于 React 组件测试
  testEnvironment: 'node',
  
  // 测试文件匹配模式
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  
  // 模块文件扩展名
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // 转换配置
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
      },
    }],
  },
  
  // 模块名称映射（支持路径别名）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // 处理 CSS 和其他静态资源
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  
  // 设置文件：在每个测试文件运行前执行的代码
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // 覆盖率收集
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    '!app/**/*.d.ts',
    '!app/**/*.stories.{ts,tsx}',
    '!app/layout.tsx',
    '!app/page.tsx',
  ],
  
  // 覆盖率阈值（可选）
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
  
  // 忽略的路径
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/out/',
    // Playwright tests must not be executed by Jest
    '/tests/.*\\.spec\\.ts$',
  ],
  
  // 模块路径
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // 全局设置
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react',
      },
    },
  },
}

// createJestConfig 以这种方式导出，确保 next/jest 可以加载 Next.js 配置
module.exports = createJestConfig(customJestConfig)

