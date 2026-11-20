# CSM

## 当前阶段：周末 MVP（2026-11-21 至 11-22）

一个纯前端的静态网页：上传 draw.io 架构图，用规则重建系统模型（系统、层次、连接），重新渲染成嵌套架构图，把不确定、归属不明、未使用的内容标出来。用户可以确认、拒绝、改名，结果自动保存在浏览器里。

**完整规格见 `docs/weekend-mvp.md`。动手前先读完它，按其中第 14 节的顺序推进。**

## 背景与边界

这个仓库是一个更大构想（AI-native 产品工程平台）的第一步。那套长期架构里有多租户、双部署、Change-set 事务、Revision、Type Registry、SysML v2 映射等设计。**这些都不在本次范围内，不要实现，也不要为它们预留抽象。** 规格没写的功能就是不做；觉得有必要时，先停下来问。

不调用 AI，不做后端，不连数据库。

## 技术栈

Vite + React + TypeScript（strict）、`@xyflow/react`、`elkjs`、`pako`、Vitest（jsdom 环境）。不加其他运行时依赖，确需添加时先说明理由。

## 常用命令

```
npm run dev       本地开发
npm test          运行 Vitest
npm run build     构建到 dist/
npm run lint      类型检查（tsc --noEmit）
```

## 必须遵守的规则

1. **模型是唯一事实，画布只是投影。** 画布不保存任何模型数据；每次渲染都从 Model 重新计算。
2. **只有 `applyEdit` 能修改 Model。** 它是纯函数，返回新对象；UI 组件不得直接改 Model。
3. **每个模型元素都必须带 `source`**，指回原图的 cellId。规则无法处理的图元一律进未使用清单并写明原因，不要丢弃，也不要抛异常。
4. **导入必须确定。** 同一文件导入两次结果完全相同，ID 由 cellId 派生，不用随机数，也不从名称计算。
5. **视图布局与模型分开存。** 拖动节点只改视图布局，不写编辑日志。
6. `src/model/` 和 `src/import/` 不得 import React，保证能在 Node 里单独测试。
7. 界面文字统一放在 `src/strings.ts`，用中文。代码、标识符、提交信息用英文。

## 工作方式

- 先写或更新测试，再写实现。规格第 12 节的自动化测试用 `fixtures/gateway.drawio` 作输入，期望值写在规格第 11 节。
- 每完成第 14 节表里的一个时段，就提交一次并确认 `npm test` 与 `npm run build` 都通过，然后推送到 `main`，由 Cloudflare Pages 自动构建部署（构建命令里先跑测试）。
- 第一件事是把空壳页面部署到 Cloudflare Pages（规格第 13 节）。
- 遇到规格没覆盖的 draw.io 写法：先让它进未使用清单，并在 `docs/open-questions.md` 里记一条，不要临时发明新规则。
- ELK 嵌套布局调了 2 小时还不行，就停下，只保留原图布局，在 `docs/open-questions.md` 记下卡在哪里。

## 完成的定义

规格第 12 节的自动化测试全部通过，手工检查清单全部勾上，线上地址可以访问。
