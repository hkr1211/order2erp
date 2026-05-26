# ERP 查询中台开发交接说明

更新日期：2026-05-26

## 项目目标

本项目是蕴杰金属内部 ERP 查询中台，目标是把智邦 ERP 中分散的数据同步到本地 SQLite，再按老板、管理层、PMC、销售、跟单员、财务和车间的工作视角重新组织展示。

核心价值不是替代 ERP，而是从复杂 ERP 数据里提取“哪里有问题、哪里可能出问题、下一步该做什么”。

## 当前技术栈

- 后端：Node.js 原生 HTTP 服务，入口 `src/server.js`
- 本地数据库：SQLite，封装在 `src/localDb.js`
- ERP 接入：`src/erpClient.js`、`src/syncService.js`
- 数据分析层：`src/localAnalytics.js`
- 页面渲染：当前大部分仍在 `src/server.js`，车间看板已拆到 `src/pages/workshopBoardPage.js`
- 测试：Node test runner
- 浏览器验证：Playwright smoke 脚本

## 安全原则

- 默认优先读取 SQLite，不直接访问 ERP。
- ERP 同步必须小批量、顺序执行、带冷却时间，避免卡死 ERP 服务。
- 生产时间谨慎同步，批量补齐尽量安排在中午、下班后或服务器空闲时。
- 不要绕过 `syncPause`、`erpHealth`、`erpRequestQueue` 里的保护逻辑。

## 常用命令

```bash
npm start
npm run check
npm run smoke:workshop
```

`npm run smoke:workshop` 要求本地服务已经启动，并且 Playwright Chromium 能在当前系统权限下运行。

## 主要页面

- `/pmc`：PMC 作战指挥台
- `/orders`：订单中心
- `/followup`：跟单员工作台
- `/finance`：财务中心
- `/materials`：物料中心
- `/dispatch`：派工进度追踪
- `/workshop-board`：车间电子看板总览
- `/workshop-board/rolling`：轧制大屏
- `/workshop-board/stamping`：冲压大屏
- `/workshop-board/tungsten-molybdenum`：钨钼大屏
- `/workshop-board/rolling?rotate=1`：三工段轮播大屏入口
- `/foreign-trade`：外贸订单看板
- `/system`：系统状态与工具入口
- `/sqlite-coverage`：SQLite 覆盖率
- `/history-sync`：历史同步
- `/erp-logs`：ERP 请求日志

## 当前模块边界

- `src/server.js`：路由、通用 HTML 模板、仍未拆分的大部分页面。
- `src/pages/workshopBoardPage.js`：车间看板总览、三工段大屏、自动滚动与轮播。
- `src/localAnalytics.js`：PMC、车间看板、外贸、财务等本地分析模型。
- `src/localDb.js`：SQLite 表结构、增删改查。
- `scripts/smokeWorkshop.js`：车间看板 Playwright 冒烟测试。

## 下一步重构建议

优先继续把 `src/server.js` 里的页面按业务域拆分：

1. `src/pages/html.js`：通用 `modulePage`、`modulePanel`、导航和格式化工具。
2. `src/pages/pmcPage.js`：PMC 作战指挥台。
3. `src/pages/financePage.js`：财务中心。
4. `src/pages/userRolesPage.js`：用户信息维护。
5. `src/pages/systemPage.js`：系统状态、覆盖率、日志入口。

每拆一个模块，都先跑：

```bash
npm run check
```

涉及页面视觉或跳转，再跑对应 smoke 脚本。

## 已知风险

- `src/server.js` 仍然偏大，修改页面时容易误碰不相关模块。
- 派工和销售订单的自动匹配率受 ERP 字段完整性影响，很多派工仍需人工绑定。
- SQLite 数据覆盖率依赖历史同步是否补齐，页面判断结论不能脱离“最近同步时间”解读。
- Playwright 在 Codex 沙箱内可能被 macOS 权限拦截，必要时需要非沙箱执行。
