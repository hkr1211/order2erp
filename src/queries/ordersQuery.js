import { addDays, clampInt, daysBetween, formatDate, formatDateTime, parseBoolean, parseDate, parseJson, parseNumber, startOfDay } from "../displayUtils.js";
import { normalizeTable, toBusinessView } from "../erpClient.js";
import { queryOrderDeliveryRisks } from "../orderDeliveryRisks.js";
import { queryOrderShortages } from "../orderShortages.js";
import { scopeRowsForUser } from "../auth.js";
import { standardRisksForDomain } from "../models/standardRiskAccess.js";
import { attachRiskSummary, riskIndexByRelatedNo } from "../models/riskSelectors.js";

export function createOrdersQueries({
  client,
  erpProtectionMode,
  latestPmcSnapshot,
  listStandardRisks = () => [],
  listMaterialAlerts,
  listSalesOrders,
  summarizeDataSourceError,
  withTimeout
}) {
  async function queryOrderCenter(params = {}) {
    const pageIndex = clampInt(params.pageindex || 1, 1, 10000);
    const pageSize = clampInt(params.pagesize || 100, 1, 100);
    const offset = (pageIndex - 1) * pageSize;
    const contractLimit = clampInt(params.contract_limit || pageSize, 1, 30);
    const dueSoonDays = clampInt(params.due_soon_days || 7, 1, 60);
    const scanSize = clampInt(params.scan_size || 100, 1, 500);
    const searchKey = params.searchKey || "";
    const statusFilter = params.status || "";
    const refresh = parseBoolean(params.refresh);
    const today = startOfDay(parseDate(params.today) || new Date());
    const snapshot = latestPmcSnapshot();

    if (!refresh) {
      const localRows = localOrderCenterRows({ limit: pageSize, offset, statusFilter, searchKey, today, authUser: params.auth_user });
      if (localRows.allRows.length || localRows.totalRows > 0) {
        const standardRisks = standardRisksForDomain({ domain: "orders", rows: localRows.filteredRows, snapshot, listStandardRisks, authUser: params.auth_user });
        const riskIndex = riskIndexByRelatedNo(standardRisks);
        const pageRows = attachRiskSummary(localRows.pageRows, riskIndex, "order_no");
        const totalPages = Math.max(1, Math.ceil((localRows.filteredRows.length || localRows.totalRows) / pageSize));
        return {
          header: { status: 0, message: "ok" },
          body: {
            model: "order_center",
            cached: true,
            scan: {
              pageindex: pageIndex,
              pagesize: pageSize,
              contract_limit: contractLimit,
              due_soon_days: dueSoonDays,
              scan_size: scanSize,
              searchKey,
              status: statusFilter
            },
            page: null,
            pagination: {
              page_index: pageIndex,
              page_size: pageSize,
              total_pages: totalPages,
              total_sqlite_rows: localRows.totalRows,
              filtered_rows: localRows.filteredRows.length,
              page_rows: localRows.pageRows.length,
              has_previous: pageIndex > 1,
              has_next: pageIndex < totalPages
            },
            summary: orderCenterSummary(localRows.allRows, localRows.filteredRows),
            rows: pageRows,
            sections: {
              standard_risks: standardRisks
            },
            source_status: {
              sqlite_sales_orders: { ok: true, rows: localRows.totalRows, filtered_rows: localRows.filteredRows.length }
            },
            notes: [
              "当前读取本地 SQLite 销售订单表。",
              "订单列表已分页显示；每页最多 100 条，避免浏览器一次渲染过多行。",
              "点击“刷新实时订单”会直接访问 ERP；点击“谨慎同步订单20条”可小批量更新本地 SQLite。"
            ]
          }
        };
      }
    }

    if (snapshot && !refresh && !searchKey) {
      const rows = orderCenterRowsFromSnapshot(snapshot.payload);
      const scopedRows = scopeRowsForUser(rows, params.auth_user, "orders");
      const filteredRows = statusFilter ? scopedRows.filter((row) => row.status_code === statusFilter) : scopedRows;
      const standardRisks = standardRisksForDomain({ domain: "orders", rows: filteredRows, snapshot, listStandardRisks, authUser: params.auth_user });
      const riskIndex = riskIndexByRelatedNo(standardRisks);
      return {
        header: { status: 0, message: "ok" },
        body: {
          model: "order_center",
          cached: true,
          cache_created_at: snapshot.created_at,
          scan: {
            pageindex: pageIndex,
            pagesize: pageSize,
            contract_limit: contractLimit,
            due_soon_days: dueSoonDays,
            scan_size: scanSize,
            searchKey,
            status: statusFilter
          },
          page: null,
          summary: orderCenterSummary(scopedRows, filteredRows),
          rows: attachRiskSummary(filteredRows, riskIndex, "order_no"),
          sections: {
            standard_risks: standardRisks
          },
          source_status: {
            pmc_snapshot: { ok: true, created_at: snapshot.created_at }
          },
          notes: [
            `当前读取本地驾驶舱快照：${formatDateTime(snapshot.created_at)}。`,
            "点击“刷新实时订单”可重新扫描 ERP 销售订单、合同明细、交期风险和缺料风险。"
          ]
        }
      };
    }

    if (erpProtectionMode && !refresh && !searchKey) {
      return {
        header: { status: 0, message: "offline order center" },
        body: emptyOrderCenterBody({
          pageIndex,
          pageSize,
          contractLimit,
          dueSoonDays,
          scanSize,
          searchKey,
          statusFilter,
          message: "ERP保护模式已开启，订单中心未找到本地 SQLite/快照数据时不再自动请求 ERP。"
        })
      };
    }

    try {
      const timeoutMs = clampInt(params.timeout_ms || 12000, 1000, 30000);
      const [salesResult, deliveryRisks, shortages] = await Promise.all([
        withTimeout(client.queryView("sales_orders", {
          searchKey,
          pageindex: String(pageIndex),
          pagesize: String(pageSize)
        }), timeoutMs),
        withTimeout(queryOrderDeliveryRisks(client, {
          searchKey,
          pageindex: String(pageIndex),
          pagesize: String(pageSize),
          contract_limit: String(contractLimit),
          due_soon_days: String(dueSoonDays)
        }), timeoutMs),
        withTimeout(queryOrderShortages(client, {
          searchKey,
          pageindex: String(pageIndex),
          pagesize: String(pageSize),
          contract_limit: String(contractLimit),
          scan_size: String(scanSize)
        }), timeoutMs)
      ]);

      const salesTable = normalizeTable(salesResult);
      const salesOrders = toBusinessView("sales_orders", salesTable).rows;
      const riskIndex = indexOrderRisks(deliveryRisks.body.rows || []);
      const shortageIndex = indexOrderShortages(shortages.body.rows || []);
      const rows = salesOrders.map((order) => mapOrderCenterRow(order, riskIndex, shortageIndex));
      const scopedRows = scopeRowsForUser(rows, params.auth_user, "orders");
      const filteredRows = statusFilter ? scopedRows.filter((row) => row.status_code === statusFilter) : scopedRows;

      return {
        header: { status: 0, message: "ok" },
        body: {
          model: "order_center",
          scan: {
            pageindex: pageIndex,
            pagesize: pageSize,
            contract_limit: contractLimit,
            due_soon_days: dueSoonDays,
            scan_size: scanSize,
            searchKey,
            status: statusFilter
          },
          page: salesTable.page,
          summary: orderCenterSummary(scopedRows, filteredRows),
          rows: filteredRows,
          source_status: {
            sales_orders: { ok: true, rows: salesOrders.length, page: salesTable.page },
            order_delivery_risks: {
              ok: (deliveryRisks.body.errors || []).length === 0,
              checked_orders: deliveryRisks.body.summary.checked_orders,
              risk_rows: deliveryRisks.body.summary.risk_rows
            },
            order_shortages: {
              ok: (shortages.body.errors || []).length === 0,
              checked_orders: shortages.body.summary.checked_orders,
              shortage_rows: shortages.body.summary.shortage_rows
            }
          },
          notes: [
            "订单管理中心第一版按销售订单列表聚合交期风险和缺料风险。",
            "PO 编号后续从合同明细提取；当前列表先显示 ERP 合同号。",
            "每条订单会按交期和缺料状态推导阻塞点、优先级和下一步动作。"
          ]
        }
      };
    } catch (error) {
      return {
        header: { status: 0, message: "offline order center" },
        body: emptyOrderCenterBody({
          pageIndex,
          pageSize,
          contractLimit,
          dueSoonDays,
          scanSize,
          searchKey,
          statusFilter,
          message: summarizeDataSourceError(error)
        })
      };
    }
  }

  function localOrderCenterRows({ limit, offset = 0, statusFilter, searchKey, today = startOfDay(new Date()), authUser = null }) {
    const salesOrders = scopeRowsForUser(listSalesOrders({ limit: 5000 }).map((row) => mapLocalSalesOrder(row, today)), authUser, "orders");
    const materialAlerts = listMaterialAlerts({ limit: 500 }).filter((row) => row.alert_type === "shortage");
    const shortageIndex = indexOrderShortages(materialAlerts);
    const rows = salesOrders.map((order) => mapOrderCenterRow(order, new Map(), shortageIndex));
    const enrichedRows = rows.map((row) => {
      if (row.due_status !== "正常" || !row.delivery_date) {
        return row;
      }
      const deliveryDate = parseDate(row.delivery_date);
      if (!deliveryDate) {
        return row;
      }
      const days = daysBetween(today, startOfDay(deliveryDate));
      const dueStatus = days < 0 ? "逾期" : days <= 7 ? "7天内到期" : "正常";
      return enrichOrderCenterAction({ ...row, due_status: dueStatus, days_from_today: days });
    });
    const searchText = String(searchKey || "").trim().toLowerCase();
    const filteredRows = enrichedRows.filter((row) => {
      if (statusFilter && row.status_code !== statusFilter) {
        return false;
      }
      if (!searchText) {
        return true;
      }
      return [row.order_no, row.customer, row.owner, row.title, row.approval_status]
        .some((value) => String(value || "").toLowerCase().includes(searchText));
    });
    const safeOffset = Math.min(Math.max(offset, 0), Math.max(filteredRows.length - 1, 0));
    const pageRows = filteredRows.slice(safeOffset, safeOffset + limit);
    return { totalRows: salesOrders.length, allRows: enrichedRows, filteredRows, pageRows };
  }

  async function queryOrderDetail(params = {}) {
    const ord = params.ord || params.contract_ord;
    if (!ord) {
      return {
        header: { status: 0, message: "ok" },
        body: {
          model: "order_detail",
          contract: null,
          rows: [],
          sections: { delivery_risks: [], shortage_rows: [] },
          summary: { lines: 0, delivery_risks: 0, shortage_rows: 0 },
          notes: ["请传入合同 ord，例如 /order?ord=17328。"]
        }
      };
    }

    const dueSoonDays = clampInt(params.due_soon_days || 7, 0, 365);
    const scanSize = clampInt(params.scan_size || 100, 1, 500);
    const today = startOfDay(params.today ? new Date(params.today) : new Date());
    const dueSoonCutoff = addDays(today, dueSoonDays);
    if (params.auth_user) {
      const allowedOrders = scopeRowsForUser(listSalesOrders({ limit: 5000 }).map((row) => mapLocalSalesOrder(row, today)), params.auth_user, "orders");
      const canReadOrder = allowedOrders.some((row) => String(row.erp_id || "") === String(ord) || String(row.order_no || "") === String(ord));
      if (!canReadOrder) {
        return {
          header: { status: 403, message: "forbidden" },
          body: {
            model: "order_detail",
            forbidden: true,
            contract: null,
            rows: [],
            sections: { delivery_risks: [], shortage_rows: [] },
            summary: { lines: 0, delivery_risks: 0, shortage_rows: 0 },
            notes: ["当前用户无权查看该订单详情，或本地订单表还没有可用于授权判断的记录。"]
          }
        };
      }
    }

    const [contractLines, shortages, salesResult] = await Promise.all([
      client.queryContractLines({ ord }),
      client.queryContractShortages({ ...params, ord, scan_size: scanSize }),
      client.queryView("sales_orders", {
        ord,
        pageindex: "1",
        pagesize: "1"
      })
    ]);

    const salesRows = toBusinessView("sales_orders", normalizeTable(salesResult)).rows;
    const salesOrder = salesRows.find((row) => String(row.erp_id) === String(ord)) || salesRows[0] || {};
    const contract = {
      ...contractLines.body.contract,
      order_no: contractLines.body.contract?.order_no || salesOrder.order_no || null,
      title: contractLines.body.contract?.title || salesOrder.title || null,
      customer: salesOrder.customer || contractLines.body.contract?.customer || null,
      owner: salesOrder.owner || contractLines.body.contract?.owner || null,
      warehouse_status: salesOrder.warehouse_status || contractLines.body.contract?.detail_status || null,
      payment_status: salesOrder.payment_status || null,
      po_no: extractPoNumber(contractLines.body.contract?.raw) || extractPoNumber(contractLines.body.rows)
    };
    const deliveryRisks = (contractLines.body.rows || [])
      .map((line) => mapOrderDetailDeliveryRisk(contract, line, today, dueSoonCutoff))
      .filter(Boolean);
    const shortageRows = shortages.body.rows || [];

    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "order_detail",
        scan: {
          ord,
          today: formatDate(today),
          due_soon_days: dueSoonDays,
          scan_size: scanSize,
          cks: params.cks || ""
        },
        contract,
        rows: contractLines.body.rows || [],
        sections: {
          delivery_risks: deliveryRisks,
          shortage_rows: shortageRows
        },
        summary: {
          lines: contractLines.body.counts?.lines || 0,
          delivery_risks: deliveryRisks.length,
          overdue_rows: deliveryRisks.filter((row) => row.risk_type === "overdue").length,
          due_soon_rows: deliveryRisks.filter((row) => row.risk_type === "due_soon").length,
          shortage_rows: shortageRows.length,
          shortage_qty: shortageRows.reduce((sum, row) => sum + Number(row.shortage_qty || 0), 0)
        },
        notes: [
          "订单详情页从合同明细读取产品、数量和交期。",
          "缺料分析第一版按销售订单产品库存计算，不展开 BOM。"
        ]
      }
    };
  }

  return { queryOrderCenter, queryOrderDetail };
}

function mapLocalSalesOrder(row, today) {
  const raw = parseJson(row.raw_json, row);
  const deliveryDate = localSalesOrderDeliveryDate(row, raw);
  const parsedDelivery = parseDate(deliveryDate);
  return {
    erp_id: row.erp_id,
    order_no: row.order_no,
    title: row.product_name || row.order_no,
    customer: row.customer,
    owner: row.owner,
    amount: row.amount,
    signed_date: row.signed_date,
    delivery_date: deliveryDate,
    days_from_today: parsedDelivery ? daysBetween(today, startOfDay(parsedDelivery)) : null,
    warehouse_status: "",
    delivery_status: "",
    payment_status: "",
    approval_status: row.status_text,
    raw
  };
}

function localSalesOrderDeliveryDate(row = {}, raw = {}) {
  const value = firstText(
    row.delivery_date,
    row.deliveryDate,
    row.Date7,
    row.date7,
    row.Date2,
    row.date2,
    row.dateZZ,
    row.DateZZ,
    row.end_date,
    raw.delivery_date,
    raw.deliveryDate,
    raw.Date7,
    raw.date7,
    raw.Date2,
    raw.date2,
    raw.dateZZ,
    raw.DateZZ,
    raw.end_date,
    raw.JhDate,
    raw.jhdate,
    raw.dateJH,
    raw.DateJH
  );
  const parsed = parseDate(value);
  return parsed ? formatDate(startOfDay(parsed)) : value;
}

function orderCenterRowsFromSnapshot(payload) {
  const rows = [
    ...(payload?.sections?.overdue_orders || []).map((row) => ({ ...row, due_status: "逾期" })),
    ...(payload?.sections?.due_soon_orders || []).map((row) => ({ ...row, due_status: "7天内到期" })),
    ...(payload?.sections?.shortage_orders || []).map((row) => ({ ...row, shortage_status: "缺料" }))
  ];
  const merged = new Map();
  for (const row of rows) {
    const key = row.order_no || `${row.customer || ""}-${row.product_name || ""}-${row.delivery_date || ""}`;
    const current = merged.get(key) || {
      erp_id: row.erp_id,
      order_no: row.order_no,
      title: row.title,
      customer: row.customer,
      owner: row.owner,
      amount: row.amount,
      signed_date: row.signed_date,
      delivery_date: row.delivery_date,
      days_from_today: row.days_from_today,
      due_status: row.due_status || "正常",
      shortage_status: row.shortage_status || "未发现缺料",
      shortage_rows: 0,
      shortage_qty: 0,
      risk_products: [],
      warehouse_status: row.warehouse_status,
      delivery_status: row.delivery_status,
      payment_status: row.payment_status,
      approval_status: row.approval_status,
      raw: row.raw || row
    };
    if (row.due_status === "逾期" || row.risk_type === "overdue") {
      current.due_status = "逾期";
    } else if (row.due_status === "7天内到期" || row.risk_type === "due_soon") {
      current.due_status = current.due_status === "逾期" ? "逾期" : "7天内到期";
    }
    if (row.shortage_status === "缺料" || parseNumber(row.shortage_qty) > 0) {
      current.shortage_status = "缺料";
      current.shortage_rows += 1;
      current.shortage_qty += parseNumber(row.shortage_qty) || 0;
    }
    if (row.product_name) {
      current.risk_products.push(row.product_name);
    }
    current.delivery_date = current.delivery_date || row.delivery_date;
    current.days_from_today = current.days_from_today ?? row.days_from_today;
    merged.set(key, current);
  }
  return [...merged.values()].map((row) => enrichOrderCenterAction(row));
}

function orderCenterSummary(rows, filteredRows) {
  return {
    total_rows: rows.length,
    visible_rows: filteredRows.length,
    red_orders: rows.filter((row) => row.status_code === "red").length,
    yellow_orders: rows.filter((row) => row.status_code === "yellow").length,
    green_orders: rows.filter((row) => row.status_code === "green").length,
    shortage_orders: rows.filter((row) => row.shortage_status === "缺料").length,
    overdue_orders: rows.filter((row) => row.due_status === "逾期").length,
    due_soon_orders: rows.filter((row) => row.due_status === "7天内到期").length,
    blocked_orders: rows.filter((row) => row.blocker && row.blocker !== "无").length
  };
}

function emptyOrderCenterBody({ pageIndex, pageSize, contractLimit, dueSoonDays, scanSize, searchKey, statusFilter, message }) {
  return {
    model: "order_center",
    offline: true,
    scan: {
      pageindex: pageIndex,
      pagesize: pageSize,
      contract_limit: contractLimit,
      due_soon_days: dueSoonDays,
      scan_size: scanSize,
      searchKey,
      status: statusFilter
    },
    page: null,
    summary: {
      total_rows: 0,
      visible_rows: 0,
      red_orders: 0,
      yellow_orders: 0,
      green_orders: 0,
      shortage_orders: 0,
      overdue_orders: 0,
      due_soon_orders: 0
    },
    rows: [],
    source_status: {
      erp_realtime: { ok: false, message }
    },
    notes: [
      `ERP 数据源暂不可用：${message}`,
      "当前无法读取实时订单列表；请稍后刷新订单中心。"
    ]
  };
}

function indexOrderRisks(rows) {
  const index = new Map();
  for (const row of rows) {
    const current = index.get(row.order_no) || {
      overdue: 0,
      dueSoon: 0,
      earliestDays: null,
      nearestDeliveryDate: null,
      products: []
    };
    if (row.risk_type === "overdue") {
      current.overdue += 1;
    }
    if (row.risk_type === "due_soon") {
      current.dueSoon += 1;
    }
    if (current.earliestDays === null || row.days_from_today < current.earliestDays) {
      current.earliestDays = row.days_from_today;
      current.nearestDeliveryDate = row.delivery_date;
    }
    if (row.product_name) {
      current.products.push(row.product_name);
    }
    index.set(row.order_no, current);
  }
  return index;
}

function indexOrderShortages(rows) {
  const index = new Map();
  for (const row of rows) {
    const current = index.get(row.order_no) || {
      rows: 0,
      shortageQty: 0,
      products: []
    };
    current.rows += 1;
    current.shortageQty += Number(row.shortage_qty || 0);
    if (row.product_name) {
      current.products.push(row.product_name);
    }
    index.set(row.order_no, current);
  }
  return index;
}

function mapOrderCenterRow(order, riskIndex, shortageIndex) {
  const risk = riskIndex.get(order.order_no) || {};
  const shortage = shortageIndex.get(order.order_no) || {};
  const dueStatus = risk.overdue > 0 ? "逾期" : risk.dueSoon > 0 ? "7天内到期" : "正常";
  const shortageStatus = shortage.rows > 0 ? "缺料" : "未发现缺料";
  const statusCode = dueStatus === "逾期" || shortageStatus === "缺料" ? "red" : dueStatus === "7天内到期" ? "yellow" : "green";
  const statusText = statusCode === "red" ? "紧急" : statusCode === "yellow" ? "预警" : "正常";
  return enrichOrderCenterAction({
    erp_id: order.erp_id,
    status_light: statusCode === "red" ? "红" : statusCode === "yellow" ? "黄" : "绿",
    status_code: statusCode,
    status_text: statusText,
    order_no: order.order_no,
    po_no: null,
    title: order.title,
    customer: order.customer,
    owner: order.owner,
    amount: order.amount,
    signed_date: order.signed_date,
    delivery_date: risk.nearestDeliveryDate || order.delivery_date || null,
    days_from_today: risk.earliestDays ?? order.days_from_today,
    due_status: dueStatus,
    shortage_status: shortageStatus,
    shortage_rows: shortage.rows || 0,
    shortage_qty: shortage.shortageQty || 0,
    risk_products: uniqueList([...(risk.products || []), ...(shortage.products || [])]).slice(0, 5),
    warehouse_status: order.warehouse_status,
    delivery_status: order.delivery_status,
    payment_status: order.payment_status,
    approval_status: order.approval_status,
    raw: order.raw
  });
}

function enrichOrderCenterAction(row) {
  const dueStatus = row.due_status || "正常";
  const shortageStatus = row.shortage_status || "未发现缺料";
  const statusCode = dueStatus === "逾期" || shortageStatus === "缺料" ? "red" : dueStatus === "7天内到期" ? "yellow" : "green";
  const blocker = shortageStatus === "缺料" ? "缺料" : dueStatus === "逾期" ? "交期逾期" : dueStatus === "7天内到期" ? "临期交付" : "无";
  const nextAction = orderNextAction(blocker);
  return {
    ...row,
    status_light: statusCode === "red" ? "红" : statusCode === "yellow" ? "黄" : "绿",
    status_code: statusCode,
    status_text: statusCode === "red" ? "紧急" : statusCode === "yellow" ? "预警" : "正常",
    priority: statusCode === "red" ? "高" : statusCode === "yellow" ? "中" : "低",
    blocker,
    next_action: nextAction,
    responsible_role: orderResponsibleRole(blocker),
    risk_products: uniqueList(row.risk_products || []).slice(0, 5)
  };
}

function orderNextAction(blocker) {
  if (blocker === "缺料") {
    return "先确认库存/采购到货，再排生产或调整交期";
  }
  if (blocker === "交期逾期") {
    return "确认延期原因并同步销售/客户";
  }
  if (blocker === "临期交付") {
    return "锁定生产、质检和发货资源";
  }
  return "按计划跟进";
}

function orderResponsibleRole(blocker) {
  if (blocker === "缺料") {
    return "PMC/采购";
  }
  if (blocker === "交期逾期") {
    return "PMC/销售";
  }
  if (blocker === "临期交付") {
    return "PMC";
  }
  return "销售/PMC";
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function mapOrderDetailDeliveryRisk(contract, line, today, dueSoonCutoff) {
  const deliveryDate = parseDate(line.delivery_date);
  if (!deliveryDate) {
    return null;
  }
  const deliveryDay = startOfDay(deliveryDate);
  const remainingQty = firstNumber(line.remaining_qty, line.demand_qty);
  if (remainingQty !== null && remainingQty <= 0) {
    return null;
  }

  const riskType = deliveryDay < today ? "overdue" : deliveryDay <= dueSoonCutoff ? "due_soon" : null;
  if (!riskType) {
    return null;
  }
  return {
    order_erp_id: contract?.erp_id || null,
    order_no: contract?.order_no || null,
    customer: contract?.customer || null,
    owner: contract?.owner || null,
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

function extractPoNumber(value) {
  const candidates = [];
  collectPoCandidates(value, candidates, 0);
  const direct = candidates.find((item) => item.keyScore > 0 && item.text);
  if (direct) {
    return direct.text;
  }
  const pattern = candidates.find((item) => /\bPO[\w/-]{3,}\b/i.test(item.text));
  return pattern ? pattern.text.match(/\bPO[\w/-]{3,}\b/i)?.[0] || pattern.text : null;
}

function collectPoCandidates(value, candidates, depth) {
  if (!value || depth > 3) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPoCandidates(item, candidates, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") {
    const text = String(value).trim();
    if (text) {
      candidates.push({ text, keyScore: 0 });
    }
    return;
  }
  for (const [key, raw] of Object.entries(value)) {
    const text = raw === undefined || raw === null ? "" : String(raw).trim();
    const keyScore = /(^|_)(po|pono|po_no|purchaseorder|purchase_order)($|_)/i.test(key) || /客户.*单|采购.*单|外贸.*单|PO/i.test(key) ? 1 : 0;
    if (text && keyScore) {
      candidates.push({ text, keyScore });
    }
    if (raw && typeof raw === "object") {
      collectPoCandidates(raw, candidates, depth + 1);
    }
  }
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
