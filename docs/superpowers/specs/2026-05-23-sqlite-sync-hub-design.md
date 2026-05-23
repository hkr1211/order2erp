# SQLite 同步型 ERP 查询中台 V1 设计

## 背景

当前系统已经可以通过智邦 ERP API 获取销售订单、库存/缺料、工序计划、待报价、应收应付等数据。现有实现是混合模式：部分页面读 SQLite 驾驶舱快照，部分页面实时调 ERP。这样开发速度快，但正式使用时会遇到三个问题：

- ERP 接口短暂 503 或超时时，实时页面可能空白或变慢。
- 多个页面重复调用 ERP，响应时间和 ERP 压力都不稳定。
- 报表、趋势、历史对比缺少稳定的数据底座。

V1 目标是把系统升级为轻量同步型中台：启动服务时自动同步一次，之后由页面按钮手动同步；业务页面优先读取 SQLite。

## 第一阶段范围

第一阶段只做高价值、低风险的数据落库：

- 销售订单：支撑订单中心、排产视图、交期类异常。
- 派工/工序计划：支撑派工进度追踪、生产进度中心。
- 库存/缺料快照：支撑物料中心、PMC 驾驶舱低库存和缺料指标。
- 同步任务状态：记录每个数据源最近同步时间、结果、行数、错误信息。

暂不落库：

- 财务应收应付、采购跟催、待报价项目，继续实时 API，后续按相同模式迁移。
- ERP 回写、权限登录、车间报工。
- 历史版本全量留存。V1 只保留当前快照和同步日志，等字段稳定后再做历史趋势。

## 同步策略

采用用户确认的策略：

- 服务启动时自动执行一次同步。
- 后续不做定时自动同步。
- 页面提供“立即同步”按钮，人工触发指定模块或全部核心数据同步。
- 同步失败时不清空旧数据，页面继续显示上次成功同步的数据，并展示错误提示。

这样可以避免频繁压 ERP，也能让老板/PMC/销售打开页面时看到可用数据。

## 数据表设计

### sync_runs

记录每次同步任务：

- id
- source_key，例如 `sales_orders`、`procedure_plans`、`inventory_alerts`
- started_at
- finished_at
- status：`running`、`success`、`failed`
- rows_synced
- error_message

### erp_sales_orders

保存订单中心需要的标准字段：

- erp_id
- order_no
- customer
- owner
- product_name
- product_code
- product_model
- quantity
- remaining_qty
- delivery_date
- signed_date
- amount
- status_text
- raw_json
- synced_at

### erp_procedure_plans

保存派工/工序计划：

- erp_id
- work_assignment_id
- order_no
- product_name
- product_code
- product_model
- procedure_name
- work_center_name
- planned_qty
- finished_qty
- remaining_qty
- planned_start_date
- planned_finish_date
- owner
- state
- raw_json
- synced_at

### erp_material_alerts

保存缺料和低库存任务：

- alert_id
- alert_type：`shortage`、`low_stock`
- order_no
- customer
- product_code
- product_name
- warehouse
- demand_qty
- available_qty
- stock_qty
- shortage_qty
- priority
- raw_json
- synced_at

## 数据流

```mermaid
flowchart LR
  ERP["智邦 ERP API"] --> Sync["同步服务"]
  Sync --> SQLite["SQLite 业务表"]
  SQLite --> Pages["PMC 页面"]
  Pages --> Manual["立即同步按钮"]
  Manual --> Sync
```

页面读取规则：

- 默认读 SQLite。
- 如果本地没有数据，显示空状态和“立即同步”按钮。
- 点击立即同步后调用同步接口，成功后刷新页面。
- 同步失败时保留旧数据，并显示错误原因。

## 页面改造

第一批改造页面：

- `/dispatch`：改为优先读取 `erp_procedure_plans`，显示派工进度追踪表。
- `/production`：复用 `erp_procedure_plans` 生成延期工序和工作中心负荷。
- `/orders`：改为优先读取 `erp_sales_orders`，刷新时重新同步销售订单。
- `/materials`：优先读取 `erp_material_alerts`，刷新时同步缺料和低库存。
- `/system`：增加同步状态面板，展示每个源的最近同步时间、行数和错误。

保留现有 `?refresh=1` 兼容入口，但语义调整为触发同步后读取 SQLite。

## 错误处理

- ERP 登录失败、503、超时都写入 `sync_runs`。
- 某个源失败不影响其他源同步。
- 页面显示最近成功数据，同时提示“最近同步失败”。
- 同步过程不删除旧数据；只有某个源同步成功后，才替换对应业务表当前快照。

## 测试与验收

验收标准：

- 启动服务后自动同步第一批数据。
- `/dispatch` 不依赖实时 ERP，也能显示派工单ID和工序计划。
- `/system` 能看到每个数据源的最近同步状态。
- 手动同步成功后，页面数据刷新。
- ERP 模拟失败时，页面仍显示旧数据并展示错误提示。

验证命令：

- `npm run check`
- 请求 `/system`，确认同步状态面板存在。
- 请求 `/dispatch`，确认页面显示 `派工进度追踪表` 和 `派工单ID`。
- 断开或阻断 ERP 后再次访问 `/dispatch`，确认仍有旧数据。

## 后续扩展

V1 稳定后，再按相同模式迁移：

- 待报价项目表。
- 应收应付表。
- 采购跟催表。
- 历史趋势表和月报统计。
- 定时同步策略，例如每 15 分钟自动同步一次。
