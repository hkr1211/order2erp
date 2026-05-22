import { normalizeTable, toBusinessView } from "./erpClient.js";

export async function queryOrderDeliveryRisks(client, params = {}) {
  const pageIndex = clampInt(params.pageindex || 1, 1, 10000);
  const pageSize = clampInt(params.pagesize || 10, 1, 100);
  const contractLimit = clampInt(params.contract_limit || params.limit || 5, 1, 20);
  const dueSoonDays = clampInt(params.due_soon_days || 7, 0, 365);
  const today = startOfDay(params.today ? new Date(params.today) : new Date());
  const dueSoonCutoff = addDays(today, dueSoonDays);
  const includeAll = parseBoolean(params.include_all);
  const salesResult = await client.queryView("sales_orders", {
    stype: params.stype || "3",
    searchKey: params.searchKey || "",
    pageindex: String(pageIndex),
    pagesize: String(pageSize)
  });
  const salesTable = normalizeTable(salesResult);
  const orders = toBusinessView("sales_orders", salesTable).rows;
  const candidateOrders = (includeAll ? orders : orders.filter(isPendingDeliveryOrder)).slice(0, contractLimit);
  const checkedOrders = [];
  const errors = [];

  for (const order of candidateOrders) {
    if (!order.erp_id) {
      continue;
    }
    try {
      const contractLines = await client.queryContractLines({ ord: order.erp_id });
      const riskRows = contractLines.body.rows
        .map((line) => mapDeliveryRiskLine(order, line, today, dueSoonCutoff))
        .filter(Boolean);

      checkedOrders.push({
        ...compactOrder(order),
        contract: contractLines.body.contract,
        counts: {
          lines: contractLines.body.rows.length,
          risk_rows: riskRows.length,
          overdue_rows: riskRows.filter((row) => row.risk_type === "overdue").length,
          due_soon_rows: riskRows.filter((row) => row.risk_type === "due_soon").length
        },
        risk_rows: riskRows
      });
    } catch (error) {
      errors.push({
        erp_id: order.erp_id,
        order_no: order.order_no,
        title: order.title,
        message: error.message
      });
    }
  }

  const ordersWithRisk = checkedOrders.filter((order) => order.risk_rows.length > 0);
  const rows = ordersWithRisk.flatMap((order) => order.risk_rows);
  const overdueRows = rows.filter((row) => row.risk_type === "overdue");
  const dueSoonRows = rows.filter((row) => row.risk_type === "due_soon");

  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "order_delivery_risks",
      scan: {
        pageindex: pageIndex,
        pagesize: pageSize,
        contract_limit: contractLimit,
        stype: params.stype || "3",
        today: formatDate(today),
        due_soon_days: dueSoonDays,
        include_all: includeAll
      },
      page: salesTable.page,
      summary: {
        scanned_orders: orders.length,
        candidate_orders: candidateOrders.length,
        checked_orders: checkedOrders.length,
        risk_orders: ordersWithRisk.length,
        risk_rows: rows.length,
        overdue_rows: overdueRows.length,
        due_soon_rows: dueSoonRows.length,
        errors: errors.length
      },
      orders: ordersWithRisk,
      sections: {
        overdue: overdueRows,
        due_soon: dueSoonRows
      },
      rows,
      errors,
      notes: [
        "本视图按销售合同明细交期识别延期和临期交付风险。",
        "早于 today 且仍有未交数量的明细算延期；today 起 due_soon_days 天内到期的明细算临期。"
      ]
    }
  };
}

function mapDeliveryRiskLine(order, line, today, dueSoonCutoff) {
  const deliveryDate = parseDate(line.delivery_date);
  if (!deliveryDate) {
    return null;
  }
  const deliveryDay = startOfDay(deliveryDate);
  const remainingQty = firstNumber(line.remaining_qty, line.demand_qty);
  if (remainingQty !== null && remainingQty <= 0) {
    return null;
  }

  let riskType = null;
  if (deliveryDay < today) {
    riskType = "overdue";
  } else if (deliveryDay <= dueSoonCutoff) {
    riskType = "due_soon";
  }
  if (!riskType) {
    return null;
  }

  return {
    order_erp_id: order.erp_id,
    order_no: order.order_no,
    customer: order.customer,
    owner: order.owner,
    signed_date: order.signed_date,
    warehouse_status: order.warehouse_status,
    delivery_status: order.delivery_status,
    risk_type: riskType,
    days_from_today: daysBetween(today, deliveryDay),
    line_id: line.line_id,
    product_name: line.product_name,
    product_code: line.product_code,
    product_model: line.product_model,
    unit: line.unit,
    demand_qty: line.demand_qty,
    delivered_qty: line.delivered_qty,
    remaining_qty: remainingQty,
    delivery_date: line.delivery_date
  };
}

function compactOrder(order) {
  return {
    erp_id: order.erp_id,
    order_no: order.order_no,
    title: order.title,
    customer: order.customer,
    owner: order.owner,
    amount: order.amount,
    signed_date: order.signed_date,
    end_date: order.end_date,
    warehouse_status: order.warehouse_status,
    delivery_status: order.delivery_status,
    payment_status: order.payment_status,
    approval_status: order.approval_status,
    risk_flags: order.risk_flags
  };
}

function isPendingDeliveryOrder(order) {
  return order.warehouse_status === "未出库" || order.delivery_status === "未发货";
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.max(min, Math.min(max, number));
}

function firstNumber(...values) {
  for (const value of values) {
    const number = parseNumber(value);
    if (number !== null) {
      return number;
    }
  }
  return null;
}

function parseBoolean(value) {
  if (value === true || value === 1) {
    return true;
  }
  const text = value === undefined || value === null ? "" : String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function parseDate(value) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  const yearMatch = text.match(/^(\d{4})-/);
  if (yearMatch && Number(yearMatch[1]) < 2000) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) {
    return null;
  }
  return date;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
