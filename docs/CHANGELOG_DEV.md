# 开发日志

## 2026-05-26

### 已完成

- 建立 ERP 查询中台基础服务，支持本地浏览器访问。
- 智邦 ERP API 已能按接口拉取数据，并逐步同步到 SQLite。
- 建立 SQLite 同步保护：冷却时间、小批量请求、ERP 健康状态、同步暂停开关。
- 完成 PMC 作战指挥台：红黄牌风险、订单作战地图、干预清单、闭环质量。
- 完成订单中心、异常中心、报表中心、采购中心、报价中心、财务中心、物料中心、生产中心、派工追踪等页面。
- 完成用户信息维护，用于修正跟单员、财务、管理人员角色识别。
- 完成 SQLite 覆盖率、历史同步、ERP 请求日志等系统页。
- 完成外贸订单看板，按外贸出口或非 RMB 币种筛选订单。
- 完成车间电子看板：
  - 总览页 `/workshop-board`
  - 轧制大屏 `/workshop-board/rolling`
  - 冲压大屏 `/workshop-board/stamping`
  - 钨钼大屏 `/workshop-board/tungsten-molybdenum`
  - 轮播入口 `/workshop-board/rolling?rotate=1`
- 车间大屏按 `planned_start_date <= 今天 <= planned_finish_date` 统计进行中计划。
- 车间大屏字段已精简，隐藏管理字段“订单匹配方式”和“绑定销售订单”。
- 冲压工序已独立归入冲压板块，不再误入钨钼。
- 添加 `scripts/smokeWorkshop.js` 和 `npm run smoke:workshop`。
- 把车间看板页面渲染从 `src/server.js` 拆到 `src/pages/workshopBoardPage.js`。
- 新增 `docs/CODEX_HANDOFF.md`，用于减少后续上下文恢复成本。

### 当前验证

- `npm run check`：应作为每次提交前的基础验证。
- `npm run smoke:workshop`：用于验证车间看板总览、三工段大屏和轮播目标。

### 待优化

- 继续拆分 `src/server.js`，优先拆出通用 HTML 模板和 PMC/财务/系统页面。
- 为 PMC、财务、跟单员工作台补充 smoke 脚本。
- 继续提升派工与销售订单自动匹配率。
- 梳理 90 天同步覆盖率，明确哪些页面仍缺明细数据。
- 后续如接入飞书自然语言问答，应优先读取 SQLite 和受控查询接口，避免直接打 ERP。
