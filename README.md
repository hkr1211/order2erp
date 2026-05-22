# ERP 查询中台

这是第一版智邦 ERP API 查询中台骨架，用于把 ERP OpenAPI 封装成受控的只读业务视图，后续可给 OpenClaw、Hermes、企业微信机器人或 Web Chat 调用。

## 已确认的 ERP OpenAPI 规则

- 文档地址：`/sysn/view/OpenApi/help.ashx`
- ERP 版本：`32.16`
- 调用方式：HTTP `POST`
- 请求类型：`application/json`
- 登录接口：`/webapi/v3/ov1/login`
- 登录参数：`user`、`password`、`serialnum`，明文值需要加 `txt:` 前缀
- 旧版 ASP 接口请求格式：

```json
{
  "session": "登录接口返回的 header.session",
  "cmdkey": "refresh",
  "datas": [
    { "id": "searchKey", "val": "关键词" },
    { "id": "pagesize", "val": "20" },
    { "id": "pageindex", "val": "1" }
  ]
}
```

## 启动

```bash
cp .env.example .env
```

填写 `.env`：

```bash
ERP_BASE_URL=http://192.168.1.179:81
ERP_USERNAME=你的ERP账号
ERP_PASSWORD=你的ERP密码
ERP_SERIALNUM=openclaw001
PORT=3000
```

启动服务：

```bash
npm start
```

## 查询示例

```bash
curl 'http://localhost:3000/health'
open 'http://localhost:3000/pmc'
open 'http://localhost:3000/orders'
open 'http://localhost:3000/order?ord=合同ord'
open 'http://localhost:3000/materials'
open 'http://localhost:3000/procurement'
open 'http://localhost:3000/quotes'
open 'http://localhost:3000/production'
open 'http://localhost:3000/exceptions'
open 'http://localhost:3000/reports'
open 'http://localhost:3000/reports/export.csv'
open 'http://localhost:3000/reports/print'
open 'http://localhost:3000/goal'
curl 'http://localhost:3000/views'
curl 'http://localhost:3000/agent/tool-schema'
curl 'http://localhost:3000/api/sales_orders?searchKey=客户名&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/contract_detail?ord=合同ord'
curl 'http://localhost:3000/api/contract_lines?ord=合同ord'
curl 'http://localhost:3000/api/contract_shortages?ord=合同ord&scan_size=100'
curl 'http://localhost:3000/api/order_shortages?pageindex=1&pagesize=10&contract_limit=5&scan_size=100'
curl 'http://localhost:3000/api/order_delivery_risks?pageindex=1&pagesize=10&contract_limit=5&due_soon_days=7'
curl 'http://localhost:3000/api/projects?pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/pending_quotes?pageindex=1&pagesize=20&limit=20'
curl 'http://localhost:3000/api/inventory?searchKey=物料编码&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/warehouses?pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/products?searchKey=钼&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/stock_in_records?rkzt=3&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/stock_in_details?ord=137556&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/material_orders?pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/production_boms?pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/procedure_plans?pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/pmc_exceptions?pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/inventory_alerts?scan_pages=2&scan_size=50&alert_limit=20&low_stock_threshold=5&old_stock_days=180'
curl 'http://localhost:3000/api/pmc_dashboard?scan_pages=2&scan_size=50&contract_limit=5&alert_limit=20&low_stock_threshold=5&old_stock_days=180'
curl 'http://localhost:3000/api/pmc_console?scan_pages=1&scan_size=20&contract_limit=3&alert_limit=10'
curl 'http://localhost:3000/api/order_center?pageindex=1&pagesize=20&contract_limit=10&due_soon_days=7'
curl 'http://localhost:3000/api/order_detail?ord=合同ord&due_soon_days=7&scan_size=100'
```

接口返回中包含三层数据：

- `business`：给 OpenClaw/Hermes/对话系统使用的业务字段
- `normalized`：把 ERP 表格行列转成对象数组后的结构
- `raw`：ERP 原始响应，便于排错和字段追溯；登录 `session` 会被脱敏

## Agent 工具

OpenClaw 或 Hermes 可以把本中台注册成一个只读工具：

```json
{
  "name": "query_erp",
  "description": "查询智邦 ERP 的只读业务视图",
  "endpoint": "http://127.0.0.1:3000/api/{view}",
  "method": "GET",
  "views": [
    "sales_orders",
    "contract_detail",
    "contract_lines",
    "contract_shortages",
    "order_shortages",
    "order_delivery_risks",
    "projects",
    "pending_quotes",
    "inventory",
    "inventory_details",
    "warehouses",
    "products",
    "stock_in_records",
    "stock_in_details",
    "production_progress",
    "material_orders",
    "production_boms",
    "procedure_plans",
    "receivables",
    "payables",
    "pmc_exceptions",
    "inventory_alerts",
    "pmc_dashboard",
    "pmc_console",
    "order_center",
    "order_detail"
  ]
}
```

也可以直接读取工具定义：

```bash
curl 'http://localhost:3000/agent/tool-schema'
```

## 当前业务视图

- `sales_orders`：销售合同/订单查询，基于 `/webapi/v3/ov1/salesmanage/contract/billlist`
- `contract_detail`：销售合同详情，基于 `/webapi/v3/sales/contract/detail`
- `contract_lines`：销售合同产品明细，从合同详情的 `contractlist` 提取
- `contract_shortages`：合同缺料分析，按合同明细产品编号逐项查询并匹配库存可用量
- `order_shortages`：订单缺料扫描，自动取最近销售订单并逐单分析缺料
- `order_delivery_risks`：订单交期风险，按合同明细交期识别延期和临期交付
- `projects`：项目/商机查询，基于 `/webapi/v3/ov1/salesmanage/chance/list`
- `pending_quotes`：待报价项目视图，基于项目阶段和金额状态识别待报价项目
- `inventory`：库存查询，基于新版 `/webapi/v3/store/inventory/InventorySummary`
- `inventory_details`：库存明细，基于新版 `/webapi/v3/store/inventory/InventoryDetails`
- `warehouses`：仓库列表，基于 `/webapi/v3/store/WareHouseStructList`
- `products`：产品列表，基于 `/webapi/v3/ov1/salesmanage/product/billlist`
- `stock_in_records`：入库流水，基于 `/webapi/v3/ov1/storemanage/kuin/list`
- `stock_in_details`：入库产品明细，基于 `/webapi/v3/ov1/storemanage/kuin/MoreKuinList`
- `production_progress`：生产进度，先接 `/webapi/apiHelper/produce/ProcedureProgre/GetProcedureProgres`
- `material_orders`：生产领料，基于 `/webapi/apiHelper/produce/MaterialOrder/GetMaterialOrders`
- `production_boms`：物料清单，基于 `/webapi/v3/produceV2/bom/list`
- `procedure_plans`：工序计划，基于 `/webapi/v3/produceV2/procedure/planlist`
- `receivables`：收款/应收查询，基于 `/webapi/v3/ov1/financemanage/moneyback/list`
- `payables`：付款/应付查询，基于 `/webapi/v3/ov1/financemanage/moneyout/list`
- `pmc_exceptions`：第一版先聚合未出库合同、未回款合同
- `inventory_alerts`：库存异常视图，聚合低库存、冻结库存、长库龄库存
- `pmc_dashboard`：PMC 综合看板，聚合库存风险、工序延期、生产数据源状态、订单缺料扫描、交期风险和待报价项目
- `pmc_console`：PMC 驾驶舱首页数据，面向老板/PMC/销售的一屏总览
- `order_center`：订单管理中心数据，聚合销售订单、交期风险和缺料状态
- `order_detail`：订单穿透详情，按合同 ord 展示基本信息、产品明细、交期风险和缺料分析

## PMC 控制台 V1

- 图形化入口：`http://localhost:3000/pmc`
- 订单中心入口：`http://localhost:3000/orders`
- 订单详情入口：在订单中心点击订单号，或访问 `http://localhost:3000/order?ord=合同ord`
- 物料控制中心：`http://localhost:3000/materials`
- 采购跟催中心：`http://localhost:3000/procurement`
- 待报价中心：`http://localhost:3000/quotes`
- 生产进度中心：`http://localhost:3000/production`
- 异常管理中心：`http://localhost:3000/exceptions`
- 报表中心：`http://localhost:3000/reports`
- 报表导出：`http://localhost:3000/reports/export.csv`，导出 Excel 可打开的 CSV
- 报表打印版：`http://localhost:3000/reports/print`，适合浏览器打印成 PDF
- PMC 全功能路线：`http://localhost:3000/goal`
- 用户范围：老板、PMC、销售
- 运行方式：内网免登录
- 数据库：SQLite，默认保存到 `data/pmc.db`
- 首屏指标：今日订单、本月订单、逾期订单、7 天内交期订单、缺料订单、待报价项目、低库存预警
- 订单中心：状态灯、客户、负责人、金额、交期风险、缺料状态、相关产品
- 订单详情：合同基本信息、PO 编号尝试识别、产品明细、交期风险、缺料分析
- 物料中心：缺料订单、低库存、冻结库存、长库龄库存
- 采购跟催中心：入库流水、应付付款跟踪入口；采购订单和供应商联系人待接口确认
- 待报价中心：项目/商机待报价清单
- 生产中心：ERP 生产进度、领料、BOM、工序计划接口入口
- 异常中心：交期、缺料、待报价、低库存统一待办池
- 报表中心：订单、交期、缺料、报价、库存管理指标汇总，支持 CSV 导出和打印版日报
- 物料齐套口径：第一版按销售订单产品库存计算，不做 BOM 展开
- 车间报工：继续使用 ERP，本中台暂不开发报工入口

## 下一步

库存余额接口已经打通，下一步可以基于真实库存字段补 PMC 异常规则：

- 延期订单：`order_delivery_risks` 已接好第一版合同明细交期扫描
- 缺料订单：`order_shortages` 已接好第一版订单级扫描；默认取最近未发货/未出库合同并逐单分析缺料
- 待报价项目：`pending_quotes` 已接好第一版项目/商机扫描；后续可按公司真实报价流程细化阶段规则

## 库存接口验证记录

`codex` 账号可以查询仓库和产品：

- 仓库列表：不限定 `Del` 状态时可见 21 个仓库；中台接口 `GET /api/warehouses?pageindex=1&pagesize=5` 已验证可分页返回
- 产品列表：可见 16094 个产品

库存余额接口已于 2026-05-22 验证打通：

- `/webapi/v3/store/inventory/InventorySummary`：空筛选返回 2251 条库存汇总
- `/webapi/v3/store/inventory/InventoryDetails`：空筛选返回 4221 条库存明细
- `cks=42`（1号钽铌库）库存汇总返回 164 条，库存明细返回 675 条

示例库存数据：

- 高温钼棒 `Mo20201000174`：库存 6.56 kg，仓库 `4号棒丝材库`
- 锆锭 `Zr104000008`：库存 7740 kg，仓库 `2号带箔材库`
- 钽板 `Ta10201000086`：库存 3.25 kg，仓库 `1号钽铌库`

库存异常视图已接入：

- `GET /api/inventory_alerts?scan_pages=2&scan_size=50&alert_limit=20&low_stock_threshold=5&old_stock_days=180`
- 第一版规则：可用库存小于等于阈值、冻结库存大于 0、库龄超过阈值
- 当前扫描前 100 条库存汇总/明细，低库存命中 26 条，冻结库存 0 条，长库龄 0 条

PMC 数据源继续补充：

- `apiHelper` 类生产接口已确认需要在请求体传入 `session`，中台已兼容
- `production_progress`、`material_orders` 可通过中台完成鉴权调用，当前 ERP 返回空模型或空数据
- `production_boms`、`procedure_plans` 可通过新版接口调用，当前账号下返回 0 条记录
- `pmc_dashboard` 已接入综合看板：低库存、冻结库存、长库龄库存、延期工序计划、数据源状态、订单缺料扫描、订单交期风险、待报价项目
- `contract_detail` 已确认可用 Token 方式访问；`ord=0` 返回空合同模板，拿到真实合同 `ord` 后可读取 `contractlist` 产品明细，用于后续缺料订单规则
- `contract_shortages` 已完成第一版规则：按合同明细产品编号逐项查询库存汇总，输出需求量、可用量和缺口量
- `order_shortages` 已完成第一版规则：自动扫描最近销售订单，汇总存在缺料的订单和明细行
- `order_delivery_risks` 已完成第一版规则：自动扫描最近销售订单，按合同明细交期输出延期和临期交付明细
- `projects` 已确认可通过旧版移动端 ASP 格式访问；当前账号可见 1 条项目
- `pending_quotes` 已完成第一版规则：阶段含报价、询价、方案、核价、定价，或金额均为 0 且未关闭/成交的项目会进入待报价列表

已验证入库流水可查询：

- 已入库单：可见 116832 条
- 入库产品明细：可按入库单 `ord` 查询产品、编号、数量、批号、成本等字段
- 2026-05-21 最新已入库记录可通过 `GET /api/stock_in_records?rkzt=3&pageindex=1&pagesize=3` 查询
