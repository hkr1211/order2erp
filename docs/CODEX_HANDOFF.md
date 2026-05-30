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
- 页面渲染：通用模板和重点页面已拆到 `src/pages/`，`src/server.js` 主要保留路由、查询编排和少量未拆页面
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
- `/api/daily_sync/status`：每日北京时间 0 点增量同步状态

## 当前模块边界

- `src/server.js`：路由、查询编排、API 响应和少量未拆页面。
- `src/displayUtils.js`：中文字段名、日期/数字解析、布尔和分页参数等通用显示/解析工具。
- `src/pages/homePage.js`：图形化首页和入口分组。
- `src/pages/apiResultPage.js`：通用 API 查询结果 HTML 展示页。
- `src/pages/html.js`：通用 `modulePage`、`modulePanel`、全局导航、HTML 转义和通用单元格格式化。
- `src/pages/pmcPage.js`：PMC 作战指挥台、早会文本、干预处理页。
- `src/pages/ordersPage.js`：订单中心和订单穿透详情页。
- `src/pages/procedureLinksPage.js`：派工-订单人工绑定页面。
- `src/pages/followupPage.js`：角色工作台、跟单员工作台和跟单摘要页。
- `src/pages/reportsPage.js`：报表中心、日报打印版、CSV/Excel 导出、干预记录台账。
- `src/pages/financePage.js`：应收应付中心页面。
- `src/pages/systemPage.js`：数据源状态中心和系统工具入口。
- `src/pages/systemToolsPage.js`：ERP 请求日志、SQLite 覆盖率、历史同步、安全窗口、同步暂停和 PMC 路线页。
- `src/pages/userRolesPage.js`：用户信息维护页面。
- `src/pages/operationsPage.js`：遗留业务中心页面渲染；主入口已收敛到物料采购、生产、车间看板、PMC 等页面，报价/异常独立入口已停用。
- `src/pages/workshopBoardPage.js`：车间看板总览、三工段大屏、自动滚动与轮播。
- `src/localAnalytics.js`：PMC、车间看板、外贸、财务等本地分析模型。
- `src/localDb.js`：SQLite 表结构、增删改查。
- `src/historySync.js`：90天历史补数参数、安全窗口、工序汇报重复页/无新增页检测和智邦 `InDate_0/InDate_1` 日期过滤。
- `src/dailySyncScheduler.js`：每日北京时间 0 点增量同步调度，按昨天日期同步日期型历史源并刷新物料/库存告警。
- `src/queries/actionQueries.js`：干预记录台账、派工-订单人工绑定查询。
- `src/queries/systemQueries.js`：ERP 请求日志、SQLite 覆盖率、历史同步中心等系统工具查询编排。
- `src/queries/userRolesQuery.js`：用户信息维护、跟单候选识别和用户角色跳转结果编排。
- `src/queries/financeQuery.js`：应收应付中心查询、本地财务兜底、收付款风险状态和财务行映射。
- `src/queries/materialExceptionQuery.js`：物料中心、物料任务和遗留异常闭环状态查询；异常独立页面已并入 PMC 待响应风险。
- `src/queries/ordersQuery.js`：订单中心、订单穿透详情、本地订单分页和交期/缺料聚合。
- `src/queries/pmcQuery.js`：PMC 控制台、跟单工作台、本地 PMC 汇总和实时 PMC 聚合。
- `src/queries/productionQuery.js`：生产中心、派工追踪、车间看板和工作中心负荷查询。
- `src/queries/procurementQuery.js`：采购跟催中心查询、入库/应付组合跟催和供应商汇总。
- `src/queries/quotesQuery.js`：报价归档/外贸遗留查询；报价中心不再作为主业务入口和默认同步源。
- `src/queries/reportSchedulingQuery.js`：报表中心、日报导出数据源、排产甘特视图和插单影响查询。
- `scripts/smokeWorkshop.js`：车间看板 Playwright 冒烟测试。

## 下一步重构建议

继续把 `src/server.js` 里剩余的查询编排和路由逻辑按业务域拆分，建议顺序：

1. 继续把 `src/server.js` 中的 API 路由胶水、历史同步执行包装和系统状态查询按领域拆小。
2. 把重复的表格、按钮、筛选表单样式沉到 `src/pages/html.js`。
3. 为 PMC、财务、系统、用户角色、报表和排产补充 smoke 脚本，降低重构回归风险。

每拆一个模块，都先跑：

```bash
npm run check
```

涉及页面视觉或跳转，再跑对应 smoke 脚本。

## 已知风险

- `src/server.js` 仍然偏大，但主要页面渲染已拆出；后续风险主要集中在路由、查询编排和 ERP 同步入口。
- 派工和销售订单的自动匹配率受 ERP 字段完整性影响，很多派工仍需人工绑定。
- 工序汇报历史已确认智邦接口支持 `InDate_0/InDate_1` 添加日期过滤；安全窗口发现重复页或整页已存在于 SQLite 时会停止，并在结果里显示告警、新增行数和记录样例。
- PMC 已加入跨工段流转风险：当前 V1 按“同一销售订单下轧制未完 + 冲压/钨钼 3 天内要料”识别前后工段断点，并复用派工-订单人工绑定/辅助匹配结果补齐缺失订单号。页面同时显示前后工段监控覆盖率、缺口清单和转序交接清单，提示缺订单号、缺轧制前道或需要确认半成品入库/转序；转序交接支持“确认已入库/确认已转序/后道已接收”本地留痕。后续如果能从 ERP 取得半成品批次/转序单，可进一步从订单级升级到批次级监控。
- PMC 顶部已有“数据可信度”区块，用本地 SQLite 行数和 `synced_at` 判断销售订单、物料/库存告警、派工计划、库存明细、应收应付是否今日同步、可用、需关注或无数据。
- PMC 风险占比已改为统一风险池口径，使用红黄牌风险事项 / 监控事项，监控事项包含销售订单、派工、物料告警和财务风险行。
- PMC 支持 `command_view=1` 指挥模式，只保留数据可信度、早会重点、红黄牌、待干预和前后工段闭环，适合老板/管理者快速查看。
- PMC 红黄牌区包含“风险来源汇总”，按风险类型聚合红牌数、黄牌数、责任角色、下一步动作和代表问题。
- PMC 红黄牌区包含“责任部门待办”，按责任角色聚合红牌、黄牌、待办数、主要风险和代表问题。
- 主导航已精简为：首页、PMC、订单、生产、车间看板、物料采购、财务、系统。旧 `/quotes` 跳转 `/pmc?rebuild=1`，旧 `/exceptions` 跳转 `/pmc?rebuild=1&open_only=1`，避免用户继续把报价/异常当独立中心使用。
- PMC 红黄牌和早会重点包含“风险评分/评分依据”，评分综合红黄牌、风险类型、到期/逾期状态和剩余/缺口数量。
- PMC 红黄牌和早会重点按风险评分倒序排列，同分再按红黄牌、风险类型和日期排序。
- PMC KPI 下方新增“指挥结论”，自动提炼最高风险、责任部门压力和数据可信度，帮助老板/管理层先看判断再看明细。
- PMC “指挥结论”已补充早会重点、责任人、反馈时限和需拍板事项；红牌默认要求 4 小时内反馈，责任压力类要求当天更新处理结果。
- PMC 指挥结论下方新增“早会行动清单”，由指挥结论派生行动编号、早会追问、要求结果和升级规则，便于早会逐项点名跟进。
- 派工人工绑定 `/procedure-links` 已加入 ERP 字段检查、工序汇报主题编号反查和补充路径；当前已确认本地 `erp_procedure_plans` 的 raw_json 不含订单/合同字段，需通过工序汇报“单据主题”、合同标题/明细或人工核对派工单来补关系。
- 订单-工序覆盖率摘要中的“未关联派工”已改为真实总数，明细列表仍限制展示前 30 条，避免页面过长。
- PMC/车间看板的派工-订单匹配已支持“工序汇报主题匹配”：同产品+同工序的工序汇报主题若提取到 5/6 位编号，并且该编号只命中一个本地销售订单标题，就自动补订单号；命中多个或本地销售订单未同步到时不自动绑定。
- SQLite 数据覆盖率依赖历史同步是否补齐，页面判断结论不能脱离“最近同步时间”解读。
- Playwright 在 Codex 沙箱内可能被 macOS 权限拦截，必要时需要非沙箱执行。
