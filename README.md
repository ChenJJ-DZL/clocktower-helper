
# 血染钟楼说书人助手

by 拜甘教成员-大长老
在线网页（点开即食）：baigangroup.fun

## 项目简介

这是一个血染钟楼（Blood on the Clocktower）说书人助手项目，基于 Next.js 框架开发。项目旨在为血染钟楼游戏提供完整的说书人辅助工具，包括角色管理、夜晚行动顺序、游戏流程控制等功能。

## 项目状态

| 模块 | 状态 |
|------|------|
| 角色能力迁移（新引擎） | ✅ 100% 完成（98个能力文件） |
| 事件总线统一 | ✅ 完成 |
| 夜晚顺序管理统一 | ✅ 完成 |
| 新引擎生产使用 | ✅ 已上线 |
| JINX 规则系统 | ✅ 基础架构已实现 |
| **新引擎能力执行桥接** | ✅ **已修复** — 旧 handler 断开导致技能不生效 |
| **rolesData.json meta 数据** | ✅ **42 角色已补齐** — 98/98 与 ability 文件对齐 |
| 旧引擎文件清理 | ✅ `useNightLogic.ts` 已删除 |

## 游戏规则文档

详细的游戏规则说明请参阅：[血染钟楼游戏规则说明](./docs/血染钟楼游戏规则说明.md)

该文档包含：
- 游戏基本规则和胜利条件
- 邪恶阵营所有特殊胜利条件详细说明
- 游戏流程和阶段说明
- 角色能力实现状态
- 项目实现差距分析

## 规则自查报告

项目规则自查报告：[规则自查表](./docs/archive/规则自查表.md)（存档）

该报告详细分析了项目代码与官方规则的差异，并提出了具体的修改建议。

## 技术栈

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
