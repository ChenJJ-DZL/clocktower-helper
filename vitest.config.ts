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
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
