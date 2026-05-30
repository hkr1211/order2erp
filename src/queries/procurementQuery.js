import { clampInt, daysBetween, parseDate, parseNumber, startOfDay } from "../displayUtils.js";
import { normalizeTable, toBusinessView } from "../erpClient.js";
import { scopeRowsForUser } from "../auth.js";
import { mapFinanceRow } from "./financeQuery.js";

export function createProcurementQueries({ client, erpProtectionMode, listFinanceRecords = () => [], listPurchaseOrders = () => [], listSuppliers = () => [], summarizeDataSourceError, withTimeout }) {
  async function queryProcurementCenter(params = {}) {
    if (params.refresh !== "1" && !params.searchKey) {
      const localPurchaseOrders = scopeRowsForUser(listPurchaseOrders({ limit: clampInt(params.local_limit || 10000, 1, 100000) }), params.auth_user, "procurement");
      const localSuppliers = scopeRowsForUser(listSuppliers({ limit: clampInt(params.supplier_limit || 5000, 1, 100000) }), params.auth_user, "procurement");
      const localFinanceRows = scopeRowsForUser(listFinanceRecords({ limit: clampInt(params.finance_limit || 10000, 1, 100000) }), params.auth_user, "finance");
      if (localPurchaseOrders.length || localSuppliers.length || localFinanceRows.length) {
        return {
          header: { status: 0, message: "ok" },
          body: buildLocalProcurementCenter({
            purchaseOrders: localPurchaseOrders,
            suppliers: localSuppliers,
            financeRows: localFinanceRows,
            today: startOfDay(parseDate(params.today) || new Date())
          })
        };
      }
    }
    if (erpProtectionMode && params.refresh !== "1" && !params.searchKey) {
      return {
        header: { status: 0, message: "ok" },
        body: emptyProcurementCenterBody("ERP保护模式已开启，采购跟催中心暂不自动访问 ERP；请确认 ERP 稳定后再使用实时刷新或接口按钮。")
      };
    }
    const pageindex = params.pageindex || 1;
    const pagesize = params.pagesize || 20;
    const timeoutMs = clampInt(params.timeout_ms || 5000, 1000, 15000);
    const today = startOfDay(parseDate(params.today) || new Date());
    const [stockInResult, payablesResult] = await Promise.allSettled([
      withTimeout(client.queryView("stock_in_records", {
        pageindex,
        pagesize,
        rkzt: params.rkzt || "",
        searchKey: params.searchKey || ""
      }), timeoutMs),
      withTimeout(client.queryView("payables", {
        pageindex,
        pagesize,
        searchKey: params.searchKey || ""
      }), timeoutMs)
    ]);
    const sourceStatus = {
      stock_in_records: {
        ok: stockInResult.status === "fulfilled",
        message: stockInResult.status === "rejected" ? summarizeDataSourceError(stockInResult.reason) : null
      },
      payables: {
        ok: payablesResult.status === "fulfilled",
        message: payablesResult.status === "rejected" ? summarizeDataSourceError(payablesResult.reason) : null
      }
    };
    const sourceNotes = Object.entries(sourceStatus)
      .filter(([, status]) => !status.ok)
      .map(([name, status]) => `${name} 数据源暂不可用：${status.message}`);
    const stockInTable = stockInResult.status === "fulfilled" ? normalizeTable(stockInResult.value) : { rows: [], page: null };
    const stockInRows = stockInResult.status === "fulfilled" ? scopeRowsForUser(toBusinessView("stock_in_records", stockInTable).rows, params.auth_user, "procurement") : [];
    const payableTable = payablesResult.status === "fulfilled" ? normalizeTable(payablesResult.value) : { rows: [], page: null };
    const payableRows = scopeRowsForUser(payableTable.rows.map((row) => mapFinanceRow(row, "payable", today)), params.auth_user, "finance");
    const followupRows = buildProcurementFollowups(stockInRows, payableRows, today);
    const supplierRows = topProcurementSuppliers(followupRows);

    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "procurement_center",
        generated_at: new Date().toISOString(),
        offline: sourceNotes.length > 0,
        summary: {
          followup_tasks: followupRows.length,
          urgent_followups: followupRows.filter((row) => row.priority === "高").length,
          inbound_records: stockInRows.length,
          payable_records: payableRows.length,
          supplier_count: supplierRows.length,
          source_errors: sourceNotes.length
        },
        sections: {
          stock_in_records: stockInRows,
          payables: payableRows,
          followups: followupRows,
          suppliers: supplierRows
        },
        source_status: sourceStatus,
        notes: [
          ...sourceNotes,
          "实时刷新模式使用入库流水和应付付款生成临时跟催清单。",
          "默认页面优先读取本地 SQLite 采购订单、供应商档案和应付数据，减少 ERP 压力。"
        ]
      }
    };
  }

  return { queryProcurementCenter };
}

function emptyProcurementCenterBody(message) {
  return {
    model: "procurement_center",
    generated_at: new Date().toISOString(),
    cached: true,
    offline: true,
    summary: {
      followup_tasks: 0,
      urgent_followups: 0,
      inbound_records: 0,
      payable_records: 0,
      supplier_count: 0,
      source_errors: 0
    },
    sections: {
      stock_in_records: [],
      payables: [],
      followups: [],
      suppliers: []
    },
    source_status: {
      erp_protection_mode: { ok: true, message }
    },
    notes: [
      message,
      "后续把采购订单/供应商跟催同步到 SQLite 后，本页会默认读取本地数据。"
    ]
  };
}

function buildLocalProcurementCenter({ purchaseOrders = [], suppliers = [], financeRows = [], today }) {
  const supplierByName = new Map(suppliers.map((row) => [normalizeText(row.name), row]).filter(([name]) => Boolean(name)));
  const purchaseRows = purchaseOrders.map((row) => normalizePurchaseOrder(row, supplierByName, today));
  const payableRows = financeRows
    .filter((row) => row.direction === "payable")
    .map((row) => normalizeLocalPayable(row, today));
  const followups = buildLocalProcurementFollowups(purchaseRows, payableRows);
  const supplierRows = topProcurementSuppliers(followups);

  return {
    model: "procurement_center",
    generated_at: new Date().toISOString(),
    cached: true,
    summary: {
      followup_tasks: followups.length,
      urgent_followups: followups.filter((row) => row.priority === "高").length,
      purchase_orders: purchaseRows.length,
      inbound_records: 0,
      payable_records: payableRows.length,
      supplier_count: suppliers.length,
      source_errors: 0
    },
    sections: {
      purchase_orders: purchaseRows,
      stock_in_records: [],
      payables: payableRows,
      followups,
      suppliers: supplierRows
    },
    source_status: {
      sqlite_purchase_orders: { ok: true, rows: purchaseRows.length },
      sqlite_suppliers: { ok: true, rows: suppliers.length },
      sqlite_finance_records: { ok: true, rows: financeRows.length }
    },
    notes: [
      "当前读取本地 SQLite 采购订单、供应商档案和应付数据。",
      "采购跟催按预计到货日、采购状态和未付应付生成，避免默认实时访问 ERP。"
    ]
  };
}

function normalizePurchaseOrder(row, supplierByName, today) {
  const supplier = row.supplier || "";
  const supplierProfile = supplierByName.get(normalizeText(supplier)) || {};
  const expectedDate = parseDate(row.expected_arrival_date);
  const orderDate = parseDate(row.order_date);
  const dueDays = expectedDate ? daysBetween(today, startOfDay(expectedDate)) : null;
  const ageDays = orderDate ? daysBetween(startOfDay(orderDate), today) : null;
  return {
    purchase_no: row.purchase_no || row.purchase_id || "",
    supplier,
    supplier_contact: supplierProfile.contact || "",
    supplier_phone: supplierProfile.phone || "",
    supplier_level: supplierProfile.level || "",
    title: row.title || "",
    buyer: row.buyer || "",
    amount: parseNumber(row.amount),
    order_date: row.order_date || "",
    expected_arrival_date: row.expected_arrival_date || "",
    due_days: dueDays,
    age_days: ageDays,
    status: row.status || ""
  };
}

function normalizeLocalPayable(row, today) {
  const dueDate = parseDate(row.due_date);
  const billDate = parseDate(row.bill_date);
  return {
    counterparty: row.counterparty || "",
    bill_no: row.bill_no || "",
    business_title: row.business_title || "",
    amount: parseNumber(row.amount),
    paid_amount: parseNumber(row.paid_amount),
    unpaid_amount: parseNumber(row.unpaid_amount),
    due_date: row.due_date || "",
    due_days: dueDate ? daysBetween(today, startOfDay(dueDate)) : parseNumber(row.due_days),
    age_days: billDate ? daysBetween(startOfDay(billDate), today) : parseNumber(row.age_days),
    risk_status: row.risk_status || "",
    status: row.status || "",
    owner: row.owner || ""
  };
}

function buildLocalProcurementFollowups(purchaseRows, payableRows) {
  const purchaseTasks = purchaseRows
    .filter((row) => !/完成|已入库|关闭|作废/.test(row.status || ""))
    .map((row) => {
      const dueDays = row.due_days;
      const overdue = dueDays !== null && dueDays < 0;
      const dueSoon = dueDays !== null && dueDays <= 7;
      return {
        followup_type: overdue ? "采购逾期到货" : dueSoon ? "近期到货跟催" : "采购跟踪",
        priority: overdue ? "高" : dueSoon ? "中" : "低",
        supplier: row.supplier,
        supplier_contact: row.supplier_contact,
        supplier_phone: row.supplier_phone,
        related_no: row.purchase_no,
        item: row.title,
        quantity: "",
        amount: row.amount,
        status: row.status,
        due_date: row.expected_arrival_date,
        age_days: row.age_days,
        responsible_role: "采购/PMC",
        action: overdue ? "确认供应商延误原因和最新到货日" : dueSoon ? "确认物流和到厂准备" : "跟进供应商生产/发货状态"
      };
    });
  const payableTasks = payableRows
    .filter((row) => parseNumber(row.unpaid_amount) > 0)
    .map((row) => ({
      followup_type: row.risk_status === "已逾期" ? "逾期应付" : row.risk_status === "7天内到期" ? "近期应付" : "未付应付",
      priority: row.risk_status === "已逾期" ? "高" : row.risk_status === "7天内到期" ? "中" : "低",
      supplier: row.counterparty,
      supplier_contact: "",
      supplier_phone: "",
      related_no: row.bill_no,
      item: row.business_title,
      quantity: "",
      amount: row.unpaid_amount,
      status: row.risk_status,
      due_date: row.due_date,
      age_days: row.age_days,
      responsible_role: "采购/财务",
      action: row.risk_status === "已逾期" ? "确认付款安排并反馈供应商" : "跟进付款计划和发票/入库资料"
    }));
  return [...purchaseTasks, ...payableTasks]
    .sort((a, b) => procurementPriorityWeight(b.priority) - procurementPriorityWeight(a.priority) || compareDueDate(a.due_date, b.due_date))
    .slice(0, 100)
    .map((row, index) => ({ followup_no: `CG-${String(index + 1).padStart(3, "0")}`, ...row }));
}

function buildProcurementFollowups(stockInRows, payableRows, today) {
  const inboundTasks = stockInRows.map((row) => {
    const confirmedDate = parseDate(row.confirmed_time);
    const applicationDate = parseDate(row.application_time);
    const ageDays = applicationDate ? daysBetween(startOfDay(applicationDate), today) : null;
    const pendingInbound = !confirmedDate && !/完成|已入库|确认|关闭/.test(String(row.receipt_status || ""));
    return {
      followup_type: pendingInbound ? "待入库确认" : "入库记录",
      priority: pendingInbound && ageDays !== null && ageDays >= 3 ? "高" : pendingInbound ? "中" : "低",
      supplier: firstText(row.raw?.gysname, row.raw?.glgys, row.raw?.supplier, row.applicant, row.warehouse_keeper),
      related_no: row.receipt_no,
      item: row.title,
      quantity: row.quantity,
      amount: "",
      status: row.receipt_status,
      due_date: row.confirmed_time || row.application_time,
      age_days: ageDays,
      responsible_role: "采购/仓库",
      action: pendingInbound ? "确认供应商到货与仓库入库状态" : "核对入库与应付是否匹配"
    };
  });
  const payableTasks = payableRows
    .filter((row) => parseNumber(row.unpaid_amount) > 0)
    .map((row) => ({
      followup_type: row.risk_status === "已逾期" ? "逾期应付" : row.risk_status === "7天内到期" ? "近期应付" : "未付应付",
      priority: row.risk_status === "已逾期" ? "高" : row.risk_status === "7天内到期" ? "中" : "低",
      supplier: row.counterparty,
      related_no: row.bill_no,
      item: row.business_title,
      quantity: "",
      amount: row.unpaid_amount,
      status: row.risk_status,
      due_date: row.due_date,
      age_days: row.age_days,
      responsible_role: "采购/财务",
      action: row.risk_status === "已逾期" ? "确认付款安排并反馈供应商" : "跟进付款计划和发票/入库资料"
    }));
  return [...inboundTasks, ...payableTasks]
    .filter((row) => row.followup_type !== "入库记录" || row.priority !== "低")
    .sort((a, b) => procurementPriorityWeight(b.priority) - procurementPriorityWeight(a.priority) || (parseNumber(b.amount) || 0) - (parseNumber(a.amount) || 0))
    .slice(0, 80)
    .map((row, index) => ({ followup_no: `CG-${String(index + 1).padStart(3, "0")}`, ...row }));
}

function topProcurementSuppliers(followupRows) {
  const grouped = new Map();
  for (const row of followupRows) {
    const supplier = row.supplier || "未识别供应商";
    const current = grouped.get(supplier) || {
      supplier,
      followup_tasks: 0,
      urgent_followups: 0,
      unpaid_amount: 0,
      latest_action: ""
    };
    current.followup_tasks += 1;
    if (row.priority === "高") {
      current.urgent_followups += 1;
    }
    current.unpaid_amount += parseNumber(row.amount) || 0;
    if (!current.latest_action && row.action) {
      current.latest_action = row.action;
    }
    grouped.set(supplier, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, unpaid_amount: Number(row.unpaid_amount.toFixed(2)) }))
    .sort((a, b) => b.urgent_followups - a.urgent_followups || b.unpaid_amount - a.unpaid_amount || b.followup_tasks - a.followup_tasks)
    .slice(0, 20);
}

function procurementPriorityWeight(priority) {
  if (priority === "高") {
    return 3;
  }
  if (priority === "中") {
    return 2;
  }
  return 1;
}

function compareDueDate(left, right) {
  return String(left || "9999-12-31").localeCompare(String(right || "9999-12-31"));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}
