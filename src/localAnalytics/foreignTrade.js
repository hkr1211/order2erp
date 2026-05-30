import {
  number,
  parseJson,
  round2,
  uniqueCount
} from "./utils.js";

export function buildForeignTradeBoard({ salesOrders = [], materialAlerts = [] } = {}) {
  const rows = salesOrders.map(normalizeForeignTradeOrder).filter((row) => row.is_foreign_trade);
  const foreignOrderNos = new Set(rows.map((row) => row.order_no).filter(Boolean));
  const shortageRows = materialAlerts
    .filter((row) => row.alert_type === "shortage" && foreignOrderNos.has(row.order_no))
    .map(normalizeMaterialAlert)
    .sort((a, b) => (number(b.shortage_qty) || 0) - (number(a.shortage_qty) || 0));
  const riskOrders = rows
    .filter((row) => row.is_unshipped || row.is_unpaid || row.is_pending_approval || shortageRows.some((alert) => alert.order_no === row.order_no))
    .map((row) => ({
      ...row,
      risk_flags: foreignTradeRiskFlags(row, shortageRows)
    }))
    .sort((a, b) => b.risk_flags.length - a.risk_flags.length || String(b.signed_date || "").localeCompare(String(a.signed_date || "")));
  const ownerSummary = foreignTradeOwnerSummary(rows, shortageRows);
  const customerSummary = foreignTradeCustomerSummary(rows);

  return {
    model: "foreign_trade_board",
    generated_at: new Date().toISOString(),
    cached: true,
    summary: {
      foreign_orders: rows.length,
      usd_amount: sumAmount(rows.filter((row) => row.currency === "USD"), "amount"),
      unshipped_orders: rows.filter((row) => row.is_unshipped).length,
      unpaid_orders: rows.filter((row) => row.is_unpaid).length,
      pending_approval_orders: rows.filter((row) => row.is_pending_approval).length,
      shortage_orders: uniqueCount(shortageRows, "order_no"),
      customers: uniqueCount(rows, "customer")
    },
    sections: {
      risk_orders: riskOrders.slice(0, 80),
      order_rows: rows.slice(0, 120),
      shortage_rows: shortageRows.slice(0, 80),
      owner_summary: ownerSummary,
      customer_summary: customerSummary
    },
    source_status: {
      sqlite_sales_orders: { ok: true, rows: salesOrders.length, foreign_rows: rows.length },
      sqlite_material_alerts: { ok: true, rows: materialAlerts.length, foreign_shortage_rows: shortageRows.length }
    },
    notes: [
      "外贸订单口径：合同分类为外贸出口，或币种不是 RMB。",
      "当前读取本地 SQLite，不实时访问 ERP。",
      "产品规格、数量和准确交期若主表缺失，需要继续从合同明细补齐。"
    ]
  };
}

function normalizeForeignTradeOrder(row) {
  const raw = parseJson(row.raw_json, row);
  const currency = String(raw.htbz || raw.currency || row.currency || "").trim() || "RMB";
  const category = String(raw.htfl || raw.department_or_category || row.department_or_category || "").trim();
  const statusText = String(row.status_text || "");
  const warehouseStatus = String(raw.ckjz || raw.warehouse_status || "");
  const deliveryStatus = String(raw.fhjz || raw.delivery_status || "");
  const paymentStatus = String(raw.skjz || raw.payment_status || "");
  const approvalStatus = String(raw.spzt || raw.approval_status || "");
  const title = String(raw.title || row.title || "");
  const isForeignTrade = category === "外贸出口" || (currency && currency !== "RMB") || /外贸出口|YJ外贸/i.test(`${row.order_no || ""} ${title}`);
  return {
    order_no: row.order_no,
    customer: row.customer,
    owner: row.owner || "未分配",
    title,
    currency,
    category,
    amount: number(row.amount) || 0,
    signed_date: row.signed_date,
    delivery_date: row.delivery_date || "",
    warehouse_status: warehouseStatus || statusPart(statusText, "出库"),
    delivery_status: deliveryStatus || statusPart(statusText, "发货"),
    payment_status: paymentStatus || statusPart(statusText, "收款"),
    approval_status: approvalStatus || statusPart(statusText, "审批"),
    invoice_status: raw.kpjz || raw.invoice_status || "",
    is_unshipped: /未发货/.test(`${deliveryStatus} ${statusText}`),
    is_unpaid: /未收款/.test(`${paymentStatus} ${statusText}`),
    is_pending_approval: /待审批/.test(`${approvalStatus} ${statusText}`),
    is_foreign_trade: isForeignTrade
  };
}

function statusPart(text, keyword) {
  return String(text || "").split("/").map((part) => part.trim()).find((part) => part.includes(keyword)) || "";
}

function foreignTradeRiskFlags(order, shortageRows) {
  return [
    order.is_pending_approval ? "待审批" : "",
    order.is_unshipped ? "未发货" : "",
    order.is_unpaid ? "未收款" : "",
    shortageRows.some((row) => row.order_no === order.order_no) ? "缺料" : ""
  ].filter(Boolean);
}

function foreignTradeOwnerSummary(rows, shortageRows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.owner || "未分配";
    const current = grouped.get(key) || { owner: key, foreign_orders: 0, usd_amount: 0, unshipped_orders: 0, unpaid_orders: 0, shortage_orders: 0 };
    current.foreign_orders += 1;
    if (row.currency === "USD") current.usd_amount = round2(current.usd_amount + (number(row.amount) || 0));
    if (row.is_unshipped) current.unshipped_orders += 1;
    if (row.is_unpaid) current.unpaid_orders += 1;
    grouped.set(key, current);
  }
  for (const alert of shortageRows) {
    const owner = rows.find((row) => row.order_no === alert.order_no)?.owner || "未分配";
    const current = grouped.get(owner);
    if (current) current.shortage_orders += 1;
  }
  return [...grouped.values()].sort((a, b) => b.unshipped_orders + b.unpaid_orders + b.shortage_orders - (a.unshipped_orders + a.unpaid_orders + a.shortage_orders) || b.usd_amount - a.usd_amount);
}

function foreignTradeCustomerSummary(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.customer || "未填写";
    const current = grouped.get(key) || { customer: key, foreign_orders: 0, usd_amount: 0, latest_signed_date: "" };
    current.foreign_orders += 1;
    if (row.currency === "USD") current.usd_amount = round2(current.usd_amount + (number(row.amount) || 0));
    if (String(row.signed_date || "") > String(current.latest_signed_date || "")) current.latest_signed_date = row.signed_date || "";
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.usd_amount - a.usd_amount || b.foreign_orders - a.foreign_orders).slice(0, 30);
}

function normalizeMaterialAlert(row) {
  const raw = parseJson(row.raw_json, row);
  return {
    order_no: row.order_no,
    customer: row.customer,
    product_code: row.product_code,
    product_name: row.product_name,
    warehouse: row.warehouse,
    demand_qty: row.demand_qty,
    available_qty: row.available_qty,
    stock_qty: row.stock_qty,
    shortage_qty: row.shortage_qty,
    unit: row.unit || raw?.unit || raw?.raw?.Unit || raw?.raw?.单位,
    delivery_date: row.delivery_date,
    raw
  };
}

function sumAmount(rows, key) {
  return Number(rows.reduce((sum, row) => sum + (number(row[key]) || 0), 0).toFixed(2));
}
