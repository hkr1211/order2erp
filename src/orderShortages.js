import { normalizeTable, toBusinessView } from "./erpClient.js";

export async function queryOrderShortages(client, params = {}) {
  const pageIndex = clampInt(params.pageindex || 1, 1, 10000);
  const pageSize = clampInt(params.pagesize || 10, 1, 100);
  const contractLimit = clampInt(params.contract_limit || params.limit || 5, 1, 20);
  const scanSize = clampInt(params.scan_size || params.page_size || 100, 1, 500);
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
      const shortageBody = await queryContractShortagesStrict(client, {
        ord: order.erp_id,
        cks: params.cks,
        scan_size: scanSize
      });
      checkedOrders.push({
        ...compactOrderForShortage(order),
        contract: shortageBody.contract,
        counts: shortageBody.counts,
        shortage_rows: shortageBody.rows
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

  const ordersWithShortage = checkedOrders.filter((order) => order.shortage_rows.length > 0);
  const rows = ordersWithShortage.flatMap((order) =>
    order.shortage_rows.map((row) => ({
      order_erp_id: order.erp_id,
      order_no: order.order_no,
      customer: order.customer,
      owner: order.owner,
      signed_date: order.signed_date,
      delivery_status: order.delivery_status,
      warehouse_status: order.warehouse_status,
      ...row
    }))
  );

  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "order_shortages",
      scan: {
        pageindex: pageIndex,
        pagesize: pageSize,
        contract_limit: contractLimit,
        scan_size: scanSize,
        stype: params.stype || "3",
        cks: params.cks || null,
        include_all: includeAll
      },
      page: salesTable.page,
      summary: {
        scanned_orders: orders.length,
        candidate_orders: candidateOrders.length,
        checked_orders: checkedOrders.length,
        orders_with_shortage: ordersWithShortage.length,
        shortage_rows: rows.length,
        errors: errors.length
      },
      orders: ordersWithShortage,
      rows,
      errors,
      notes: [
        "本视图默认扫描最近未发货/未出库销售订单，并逐单调用合同缺料分析。",
        "有产品编号时严格按编号匹配库存；没有编号时才按产品名称兜底。"
      ]
    }
  };
}

async function queryContractShortagesStrict(client, params = {}) {
  const pageSize = clampInt(params.scan_size || params.pagesizes || params.page_size || 100, 1, 500);
  const contractLines = await client.queryContractLines({ ord: params.ord });
  const inventoryRows = await client.lookupInventoryForContractLines(contractLines.body.rows, {
    ...params,
    page_size: pageSize
  });
  const inventoryIndex = buildInventoryIndex(inventoryRows.map(mapInventoryRow));
  const shortageRows = contractLines.body.rows
    .map((line) => {
      const demandQty = firstNumber(line.remaining_qty, line.demand_qty);
      const stock = findInventoryStock(inventoryIndex, line);
      const availableQty = stock.available_qty ?? stock.stock_qty ?? 0;
      const shortageQty = demandQty === null ? null : Math.max(0, demandQty - availableQty);
      return {
        ...line,
        demand_qty: demandQty,
        available_qty: availableQty,
        stock_qty: stock.stock_qty,
        shortage_qty: shortageQty,
        matched_by: stock.matched_by,
        inventory_matches: stock.matches
      };
    })
    .filter((row) => row.demand_qty !== null && row.shortage_qty > 0);

  return {
    model: "contract_shortages",
    contract: contractLines.body.contract,
    scan: {
      page_size: pageSize,
      cks: params.cks || null,
      strategy: "strict_product_code_then_name"
    },
    rows: shortageRows,
    counts: {
      lines: contractLines.body.rows.length,
      inventory_rows: inventoryRows.length,
      shortage_rows: shortageRows.length
    }
  };
}

function compactOrderForShortage(order) {
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

function buildInventoryIndex(rows) {
  const byCode = new Map();
  const byName = new Map();
  for (const row of rows) {
    addInventoryIndex(byCode, normalizeKey(row.product_code), row);
    addInventoryIndex(byName, normalizeKey(row.product_name), row);
  }
  return { byCode, byName };
}

function addInventoryIndex(index, key, row) {
  if (!key) {
    return;
  }
  const current = index.get(key) || {
    stock_qty: 0,
    available_qty: 0,
    matches: []
  };
  current.stock_qty += row.stock_qty || 0;
  current.available_qty += row.available_qty ?? row.stock_qty ?? 0;
  current.matches.push({
    product_name: row.product_name,
    product_code: row.product_code,
    warehouse: row.warehouse,
    stock_qty: row.stock_qty,
    available_qty: row.available_qty
  });
  index.set(key, current);
}

function findInventoryStock(index, line) {
  const codeKey = normalizeKey(line.product_code);
  if (codeKey && index.byCode.has(codeKey)) {
    return { ...index.byCode.get(codeKey), matched_by: "product_code" };
  }
  if (codeKey) {
    return emptyInventoryStock();
  }
  const nameKey = normalizeKey(line.product_name);
  if (nameKey && index.byName.has(nameKey)) {
    return { ...index.byName.get(nameKey), matched_by: "product_name" };
  }
  return emptyInventoryStock();
}

function emptyInventoryStock() {
  return {
    stock_qty: 0,
    available_qty: 0,
    matched_by: null,
    matches: []
  };
}

function mapInventoryRow(row) {
  return {
    product_name: row["产品名称"] || row.Title,
    product_code: row["产品编号"] || row["编号"] || row.Order1,
    product_model: row["产品型号"] || row["型号"] || row.Type1,
    unit: row["基本单位"] || row["单位"] || row.UnitName || row.Unit,
    stock_qty: parseNumber(firstValue(row["库存数量"], row.Num2)),
    available_qty: parseNumber(firstValue(row["可用数量"], row.KYNum)),
    warehouse: row["仓库"] || row.Ku,
    raw: row
  };
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

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
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
  const text = normalizeKey(value);
  return text === "1" || text === "true" || text === "yes";
}

function normalizeKey(value) {
  return value === undefined || value === null ? "" : String(value).trim().toLowerCase();
}
