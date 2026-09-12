import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // 旧测试已全部清除（过期），保留框架以备后续新建测试
    passWithNoTests: true,
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      // 排除Playwright E2E测试文件
      "**/*.e2e.spec.ts",
      "**/e2e_*.spec.ts",
      "**/*_e2e.spec.ts",
      "**/tests/*.spec.ts", // 排除Playwright spec文件
      "**/e2e/**/*.spec.js", // 排除Playwright E2E JS spec文件
      "**/e2e/**/*.spec.ts", // 排除Playwright E2E TS spec文件
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/test-helpers/**",
      ],
    },
  },
  // 仓库 tsconfig 使用 jsx: "preserve"（Next.js 需要），
  // 而 vitest 走 esbuild，遇到 .tsx 会原样保留 JSX → 解析失败。
  // 这里显式让 esbuild 走 React 17+ 的 automatic runtime，
  // 使 Node 环境下的组件渲染测试（react-dom/server 静态 HTML 断言）可用。
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
