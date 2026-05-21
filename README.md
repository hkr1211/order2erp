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
curl 'http://localhost:3000/views'
curl 'http://localhost:3000/agent/tool-schema'
curl 'http://localhost:3000/api/sales_orders?searchKey=客户名&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/inventory?searchKey=物料编码&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/warehouses?pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/products?searchKey=钼&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/stock_in_records?rkzt=3&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/stock_in_details?ord=137556&pageindex=1&pagesize=20'
curl 'http://localhost:3000/api/pmc_exceptions?pageindex=1&pagesize=20'
```

接口返回中包含三层数据：

- `business`：给 OpenClaw/Hermes/对话系统使用的业务字段
- `normalized`：把 ERP 表格行列转成对象数组后的结构
- `raw`：ERP 原始响应，便于排错和字段追溯

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
    "inventory",
    "inventory_details",
    "warehouses",
    "products",
    "stock_in_records",
    "stock_in_details",
    "production_progress",
    "receivables",
    "payables",
    "pmc_exceptions"
  ]
}
```

也可以直接读取工具定义：

```bash
curl 'http://localhost:3000/agent/tool-schema'
```

## 当前业务视图

- `sales_orders`：销售合同/订单查询，基于 `/webapi/v3/ov1/salesmanage/contract/billlist`
- `inventory`：库存查询，基于新版 `/webapi/v3/store/inventory/InventorySummary`
- `inventory_details`：库存明细，基于新版 `/webapi/v3/store/inventory/InventoryDetails`
- `warehouses`：仓库列表，基于 `/webapi/v3/store/WareHouseStructList`
- `products`：产品列表，基于 `/webapi/v3/ov1/salesmanage/product/billlist`
- `stock_in_records`：入库流水，基于 `/webapi/v3/ov1/storemanage/kuin/list`
- `stock_in_details`：入库产品明细，基于 `/webapi/v3/ov1/storemanage/kuin/MoreKuinList`
- `production_progress`：生产进度，先接 `/webapi/apiHelper/produce/ProcedureProgre/GetProcedureProgres`
- `receivables`：收款/应收查询，基于 `/webapi/v3/ov1/financemanage/moneyback/list`
- `payables`：付款/应付查询，基于 `/webapi/v3/ov1/financemanage/moneyout/list`
- `pmc_exceptions`：第一版先聚合未出库合同、未回款合同

## 下一步

拿到测试账号后，先验证 `sales_orders` 和 `inventory` 两个接口返回字段，再根据真实字段补 PMC 异常规则：

- 延期订单：交期字段与当前日期/预计完工日期比较
- 缺料订单：订单需求量与库存汇总的可用数量、在途数量比较
- 待报价订单：确认项目/报价接口后接入

## 库存权限排查记录

`codex` 账号可以查询仓库和产品：

- 仓库列表：不限定 `Del` 状态时可见 21 个仓库；中台接口 `GET /api/warehouses?pageindex=1&pagesize=5` 已验证可分页返回
- 产品列表：可见 16094 个产品

但当前库存余额接口仍未打通：

- `/webapi/v3/store/inventory/InventorySummary`：按文档完整参数、空筛选、指定真实产品编号查询，均返回 `Code=200` 但 `RecordCount=0`
- `/webapi/v3/store/inventory/InventoryDetails`：同样返回 `Code=200` 但 `RecordCount=0`
- `/webapi/v3/ov1/storemanage/store/list`：文档指向旧版库存查看列表，但直接调用返回空响应

这说明账号已经有库存模块的部分查询权限，但“库存余额/库存查看”的真实数据入口或权限范围仍需继续确认。后续需要用 ERP 前台同账号打开库存查看页面，对照浏览器网络请求，或请智邦接口方确认余额台账对应的接口。

已验证入库流水可查询：

- 已入库单：可见 116832 条
- 入库产品明细：可按入库单 `ord` 查询产品、编号、数量、批号、成本等字段
- 2026-05-21 最新已入库记录可通过 `GET /api/stock_in_records?rkzt=3&pageindex=1&pagesize=3` 查询
