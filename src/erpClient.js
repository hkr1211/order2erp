const DEFAULT_BASE_URL = "http://192.168.1.179:81";

export const ERP_VIEWS = {
  sales_orders: {
    name: "销售订单/合同视图",
    kind: "asp",
    path: "/sysa/mobilephone/salesmanage/contract/billlist.asp",
    cmdkey: "refresh",
    defaultParams: { stype: "0", pagesize: "20", pageindex: "1" },
    allowedParams: [
      "stype",
      "datatype",
      "ord",
      "searchKey",
      "pageindex",
      "pagesize",
      "htbh",
      "khmc",
      "title",
      "htzt",
      "dateQD_0",
      "dateQD_1",
      "tdate1",
      "tdate2",
      "_rpt_sort"
    ]
  },
  contract_detail: {
    name: "销售合同详情视图",
    kind: "modern",
    path: "/webapi/v3/sales/contract/detail",
    defaultParams: { ord: "0" },
    allowedParams: ["ord"]
  },
  inventory: {
    name: "库存视图",
    kind: "modern",
    path: "/webapi/v3/store/inventory/InventorySummary",
    defaultParams: { page_size: "20", page_index: "1" },
    paramAliases: {
      pagesize: "page_size",
      pageindex: "page_index",
      searchKey: "title"
    },
    allowedParams: [
      "cks",
      "addcate",
      "title",
      "order1",
      "type1",
      "cpfl",
      "intro1",
      "intro2",
      "intro3",
      "allunit",
      "kcnum",
      "djnum",
      "zdy1",
      "page_index",
      "page_size"
    ]
  },
  inventory_details: {
    name: "库存明细视图",
    kind: "modern",
    path: "/webapi/v3/store/inventory/InventoryDetails",
    defaultParams: { page_size: "20", page_index: "1" },
    paramAliases: {
      pagesize: "page_size",
      pageindex: "page_index",
      searchKey: "title"
    },
    allowedParams: [
      "cks",
      "adShelves",
      "addcate",
      "title",
      "order1",
      "type1",
      "cpfl",
      "intro1",
      "intro2",
      "intro3",
      "Ph",
      "Xlh",
      "gysname",
      "Bz",
      "allunit",
      "Js",
      "kcnum",
      "djnum",
      "Daterk",
      "Datesc",
      "Dateyx",
      "Dateadd",
      "page_index",
      "page_size"
    ]
  },
  warehouses: {
    name: "仓库视图",
    kind: "modern",
    path: "/webapi/v3/store/WareHouseStructList",
    defaultParams: { Del: "", page_size: "100", page_index: "1" },
    paramAliases: {
      pagesize: "page_size",
      pageindex: "page_index",
      searchKey: "Sort1"
    },
    allowedParams: ["Sort1", "Del", "page_index", "page_size"]
  },
  products: {
    name: "产品视图",
    kind: "asp",
    path: "/sysa/mobilephone/salesmanage/product/billlist.asp",
    cmdkey: "refresh",
    defaultParams: { pagesize: "20", pageindex: "1" },
    allowedParams: [
      "listadd",
      "company",
      "htcateid",
      "ords",
      "idProductClass",
      "cpname",
      "cpbh",
      "cpxh",
      "txm",
      "searchKey",
      "pagesize",
      "pageindex",
      "_rpt_sort"
    ]
  },
  stock_in_records: {
    name: "入库流水视图",
    kind: "asp",
    path: "/sysa/mobilephone/storemanage/kuin/list.asp",
    cmdkey: "refresh",
    defaultParams: { pagesize: "20", pageindex: "1" },
    allowedParams: [
      "stype",
      "datatype",
      "ord",
      "remind",
      "ly",
      "tdate1",
      "tdate2",
      "rkbh",
      "title",
      "rkzt",
      "status",
      "rklb",
      "glgys",
      "glcg",
      "searchKey",
      "pagesize",
      "pageindex",
      "_rpt_sort"
    ]
  },
  stock_in_details: {
    name: "入库产品明细视图",
    kind: "asp",
    path: "/sysa/mobilephone/storemanage/kuin/MoreKuinList.asp",
    cmdkey: "refresh",
    defaultParams: { pagesize: "20", pageindex: "1" },
    allowedParams: ["ord", "pagesize", "pageindex", "_rpt_sort"]
  },
  production_progress: {
    name: "生产进度视图",
    kind: "helper",
    path: "/webapi/apiHelper/produce/ProcedureProgre/GetProcedureProgres",
    defaultParams: { pageindex: "1", pagesize: "20" },
    allowedParams: [
      "searchKey",
      "pageindex",
      "pagesize",
      "dateStart",
      "dateEnd",
      "orderNo",
      "productId",
      "procedureId"
    ]
  },
  material_orders: {
    name: "领料视图",
    kind: "helper",
    path: "/webapi/apiHelper/produce/MaterialOrder/GetMaterialOrders",
    defaultParams: { pageindex: "1", pagesize: "20" },
    allowedParams: ["searchKey", "pageindex", "pagesize", "dateStart", "dateEnd", "orderNo", "productId"]
  },
  production_boms: {
    name: "物料清单视图",
    kind: "modern",
    path: "/webapi/v3/produceV2/bom/list",
    defaultParams: { page_size: "20", page_index: "1" },
    paramAliases: {
      pagesize: "page_size",
      pageindex: "page_index",
      searchKey: "title"
    },
    allowedParams: ["title", "page_index", "page_size"]
  },
  procedure_plans: {
    name: "工序计划视图",
    kind: "modern",
    path: "/webapi/v3/produceV2/procedure/planlist",
    defaultParams: { page_size: "20", page_index: "1" },
    paramAliases: {
      pagesize: "page_size",
      pageindex: "page_index",
      searchKey: "title"
    },
    allowedParams: ["title", "page_index", "page_size"]
  },
  receivables: {
    name: "应收/收款视图",
    kind: "asp",
    path: "/sysa/mobilephone/financemanage/moneyback/list.asp",
    cmdkey: "refresh",
    defaultParams: { pagesize: "20", pageindex: "1" },
    allowedParams: ["searchKey", "pageindex", "pagesize", "tdate1", "tdate2", "_rpt_sort"]
  },
  payables: {
    name: "应付/付款视图",
    kind: "asp",
    path: "/sysa/mobilephone/financemanage/moneyout/list.asp",
    cmdkey: "refresh",
    defaultParams: { pagesize: "20", pageindex: "1" },
    allowedParams: ["searchKey", "pageindex", "pagesize", "tdate1", "tdate2", "_rpt_sort"]
  }
};

export class ErpClient {
  constructor(options = {}) {
    this.baseUrl = stripTrailingSlash(options.baseUrl || process.env.ERP_BASE_URL || DEFAULT_BASE_URL);
    this.username = options.username || process.env.ERP_USERNAME;
    this.password = options.password || process.env.ERP_PASSWORD;
    this.serialnum = options.serialnum || process.env.ERP_SERIALNUM || "openclaw001";
    this.session = options.token || process.env.ERP_TOKEN || "";
  }

  async login() {
    if (!this.username || !this.password) {
      throw new Error("ERP_USERNAME and ERP_PASSWORD are required when ERP_TOKEN is not set.");
    }

    const payload = {
      datas: [
        { id: "user", val: withTxtPrefix(this.username) },
        { id: "password", val: withTxtPrefix(this.password) },
        { id: "serialnum", val: withTxtPrefix(this.serialnum) }
      ]
    };

    const result = await this.postJson("/webapi/v3/ov1/login", payload);
    const session = result?.header?.session;
    const status = Number(result?.header?.status ?? -1);
    if (status !== 0 || !session) {
      throw new Error(`ERP login failed: ${result?.header?.message || "missing session"}`);
    }

    this.session = session;
    return session;
  }

  async ensureSession() {
    if (this.session) {
      return this.session;
    }
    return this.login();
  }

  async queryView(viewName, params = {}) {
    const view = ERP_VIEWS[viewName];
    if (!view) {
      throw new Error(`Unknown ERP view: ${viewName}`);
    }
    const cleanParams = filterParams(applyAliases({ ...view.defaultParams, ...params }, view.paramAliases), view.allowedParams);

    if (view.kind === "asp") {
      return this.callAsp(view.path, cleanParams, view.cmdkey);
    }
    if (view.kind === "helper") {
      return this.callHelper(view.path, cleanParams);
    }
    return this.callModern(view.path, cleanParams);
  }

  async queryPmcExceptions(params = {}) {
    const pageParams = {
      pageindex: params.pageindex || "1",
      pagesize: params.pagesize || "20",
      searchKey: params.searchKey || ""
    };

    const [unshippedContracts, unpaidContracts] = await Promise.all([
      this.queryView("sales_orders", { ...pageParams, stype: "3" }),
      this.queryView("sales_orders", { ...pageParams, stype: "4" })
    ]);

    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "pmc_exceptions",
        sections: {
          unshipped_contracts: normalizeTable(unshippedContracts),
          unpaid_contracts: normalizeTable(unpaidContracts)
        },
        notes: [
          "缺料订单、待报价订单需要确认 ERP 对应接口或字段后继续补规则。",
          "当前 PMC 异常先接入未出库合同和未回款合同，作为第一版可验证数据源。"
        ]
      }
    };
  }

  async queryInventoryAlerts(params = {}) {
    const pageSize = clampInt(params.scan_size || params.pagesize || params.page_size || 100, 1, 500);
    const scanPages = clampInt(params.scan_pages || 3, 1, 20);
    const alertLimit = clampInt(params.alert_limit || params.limit || 20, 1, 200);
    const lowStockThreshold = Number(params.low_stock_threshold || params.threshold || 5);
    const oldStockDays = Number(params.old_stock_days || 180);
    const baseFilters = {};
    if (params.cks !== undefined && params.cks !== null && params.cks !== "") {
      baseFilters.cks = params.cks;
    }
    if (params.searchKey || params.title) {
      baseFilters.title = params.searchKey || params.title;
    }
    if (params.order1) {
      baseFilters.order1 = params.order1;
    }

    const summaryRows = [];
    const detailRows = [];
    for (let pageIndex = 1; pageIndex <= scanPages; pageIndex += 1) {
      const pageParams = { ...baseFilters, page_size: String(pageSize), page_index: String(pageIndex) };
      const [summary, details] = await Promise.all([
        this.queryView("inventory", pageParams),
        this.queryView("inventory_details", pageParams)
      ]);
      summaryRows.push(...normalizeTable(summary).rows);
      detailRows.push(...normalizeTable(details).rows);

      const summaryPage = summary?.Page;
      const detailsPage = details?.Page;
      const summaryDone = summaryPage?.PageCount ? pageIndex >= Number(summaryPage.PageCount) : true;
      const detailsDone = detailsPage?.PageCount ? pageIndex >= Number(detailsPage.PageCount) : true;
      if (summaryDone && detailsDone) {
        break;
      }
    }

    const lowStock = summaryRows
      .map(mapInventoryRow)
      .filter((row) => row.stock_qty !== null && row.stock_qty > 0 && row.available_qty !== null && row.available_qty <= lowStockThreshold);

    const frozenStock = summaryRows
      .map(mapInventoryRow)
      .filter((row) => row.frozen_qty !== null && row.frozen_qty > 0);

    const oldStock = detailRows
      .map(mapInventoryRow)
      .filter((row) => row.stock_age_days !== null && row.stock_age_days >= oldStockDays);

    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "inventory_alerts",
        scan: {
          scan_pages: scanPages,
          page_size: pageSize,
          alert_limit: alertLimit,
          low_stock_threshold: lowStockThreshold,
          old_stock_days: oldStockDays,
          filters: baseFilters
        },
        sections: {
          low_stock: lowStock.slice(0, alertLimit),
          frozen_stock: frozenStock.slice(0, alertLimit),
          old_stock: oldStock.slice(0, alertLimit)
        },
        counts: {
          scanned_summary_rows: summaryRows.length,
          scanned_detail_rows: detailRows.length,
          low_stock: lowStock.length,
          frozen_stock: frozenStock.length,
          old_stock: oldStock.length
        }
      }
    };
  }

  async queryContractLines(params = {}) {
    const detail = await this.queryView("contract_detail", params);
    const contract = detail?.Data || {};
    const lines = Array.isArray(contract.contractlist) ? contract.contractlist : [];

    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "contract_lines",
        contract: mapContractDetail(contract),
        rows: lines.map(mapContractLine),
        counts: {
          lines: lines.length
        },
        notes: [
          "合同明细是缺料订单计算的需求量来源。",
          "当前销售合同列表权限返回 0 行；拿到真实合同 ord 后可直接调用本视图读取产品需求明细。"
        ]
      }
    };
  }

  async queryContractShortages(params = {}) {
    const contractOrd = params.contract_ord || params.ord;
    if (!contractOrd) {
      return {
        header: { status: 0, message: "ok" },
        body: {
          model: "contract_shortages",
          contract: null,
          rows: [],
          counts: { lines: 0, shortage_rows: 0 },
          notes: ["请传入合同 ord，例如 /api/contract_shortages?ord=12345。"]
        }
      };
    }

    const pageSize = clampInt(params.scan_size || params.pagesize || params.page_size || 100, 1, 500);
    const scanPages = clampInt(params.scan_pages || 3, 1, 20);
    const [contractLines, inventoryRows] = await Promise.all([
      this.queryContractLines({ ord: contractOrd }),
      this.scanInventorySummary({ ...params, scan_size: pageSize, scan_pages: scanPages })
    ]);

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
      header: { status: 0, message: "ok" },
      body: {
        model: "contract_shortages",
        contract: contractLines.body.contract,
        scan: {
          scan_pages: scanPages,
          page_size: pageSize,
          cks: params.cks || null
        },
        rows: shortageRows,
        counts: {
          lines: contractLines.body.rows.length,
          inventory_rows: inventoryRows.length,
          shortage_rows: shortageRows.length
        },
        notes: [
          "第一版按合同明细产品编号优先匹配库存汇总；没有编号时退回产品名称匹配。",
          "真实准确的缺料判断还需要确认合同明细里的未发/未生产数量字段。"
        ]
      }
    };
  }

  async queryPmcDashboard(params = {}) {
    const alertLimit = clampInt(params.alert_limit || params.limit || 20, 1, 200);
    const today = params.today ? new Date(params.today) : new Date();
    const [inventoryAlerts, procedurePlans, materialOrders, productionBoms] = await Promise.all([
      this.queryInventoryAlerts({
        ...params,
        alert_limit: alertLimit,
        scan_pages: params.scan_pages || 2,
        scan_size: params.scan_size || 50
      }),
      this.queryView("procedure_plans", {
        pageindex: params.pageindex || 1,
        pagesize: params.pagesize || 50,
        searchKey: params.searchKey || ""
      }),
      this.queryView("material_orders", {
        pageindex: params.pageindex || 1,
        pagesize: params.pagesize || 50,
        searchKey: params.searchKey || ""
      }),
      this.queryView("production_boms", {
        pageindex: params.pageindex || 1,
        pagesize: params.pagesize || 50,
        searchKey: params.searchKey || ""
      })
    ]);

    const procedureTable = normalizeTable(procedurePlans);
    const materialOrderTable = normalizeTable(materialOrders);
    const bomTable = normalizeTable(productionBoms);
    const delayedProcedurePlans = procedureTable.rows
      .map(mapProcedurePlanRow)
      .filter((row) => row.remaining_qty === null || row.remaining_qty > 0)
      .filter((row) => isBeforeDay(row.planned_finish_date, today))
      .slice(0, alertLimit);

    const inventorySections = inventoryAlerts.body.sections;
    const sourceStatus = {
      inventory_alerts: {
        ok: true,
        scanned_rows: inventoryAlerts.body.counts.scanned_summary_rows,
        issue_count:
          inventoryAlerts.body.counts.low_stock +
          inventoryAlerts.body.counts.frozen_stock +
          inventoryAlerts.body.counts.old_stock
      },
      procedure_plans: tableStatus(procedureTable, procedurePlans),
      material_orders: tableStatus(materialOrderTable, materialOrders),
      production_boms: tableStatus(bomTable, productionBoms)
    };

    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "pmc_dashboard",
        generated_at: new Date().toISOString(),
        scan: {
          alert_limit: alertLimit,
          inventory: inventoryAlerts.body.scan,
          filters: {
            searchKey: params.searchKey || "",
            pageindex: params.pageindex || 1,
            pagesize: params.pagesize || 50
          }
        },
        summary: {
          low_stock: inventoryAlerts.body.counts.low_stock,
          frozen_stock: inventoryAlerts.body.counts.frozen_stock,
          old_stock: inventoryAlerts.body.counts.old_stock,
          delayed_procedure_plans: delayedProcedurePlans.length,
          material_order_rows: materialOrderTable.rows.length,
          bom_rows: bomTable.rows.length
        },
        sections: {
          low_stock: inventorySections.low_stock.slice(0, alertLimit),
          frozen_stock: inventorySections.frozen_stock.slice(0, alertLimit),
          old_stock: inventorySections.old_stock.slice(0, alertLimit),
          delayed_procedure_plans: delayedProcedurePlans,
          material_orders: materialOrderTable.rows.slice(0, alertLimit),
          production_boms: bomTable.rows.slice(0, alertLimit)
        },
        source_status: sourceStatus,
        notes: [
          "第一版 PMC 看板先聚合库存风险、工序计划延期和生产数据源状态。",
          "缺料订单需要销售/生产需求明细与库存可用量建立匹配关系后继续补规则。"
        ]
      }
    };
  }

  async callAsp(path, params = {}, cmdkey = "refresh") {
    const session = await this.ensureSession();
    const payload = {
      session,
      cmdkey,
      datas: Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([id, val]) => ({ id, val }))
    };
    return redactSession(await this.postJson(path, payload));
  }

  async callModern(path, params = {}) {
    const session = await this.ensureSession();
    return redactSession(await this.postJson(path, params, { "ZBAPI-Token": session }));
  }

  async callHelper(path, params = {}) {
    const session = await this.ensureSession();
    return redactSession(await this.postJson(path, { session, ...params }));
  }

  async postJson(path, payload, headers = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`ERP returned non-JSON response from ${path}: ${text.slice(0, 300)}`);
    }

    if (!response.ok) {
      throw new Error(`ERP HTTP ${response.status} from ${path}: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return data;
  }

  async scanInventorySummary(params = {}) {
    const pageSize = clampInt(params.scan_size || params.pagesize || params.page_size || 100, 1, 500);
    const scanPages = clampInt(params.scan_pages || 3, 1, 20);
    const baseFilters = {};
    if (params.cks !== undefined && params.cks !== null && params.cks !== "") {
      baseFilters.cks = params.cks;
    }
    if (params.searchKey || params.title) {
      baseFilters.title = params.searchKey || params.title;
    }

    const rows = [];
    for (let pageIndex = 1; pageIndex <= scanPages; pageIndex += 1) {
      const result = await this.queryView("inventory", {
        ...baseFilters,
        page_size: String(pageSize),
        page_index: String(pageIndex)
      });
      rows.push(...normalizeTable(result).rows);
      const page = result?.Page;
      if (page?.PageCount && pageIndex >= Number(page.PageCount)) {
        break;
      }
    }
    return rows;
  }
}

export function normalizeTable(document) {
  if (document?.Data && typeof document.Data === "object") {
    return {
      rows: [document.Data],
      columns: [],
      page: null,
      raw: document
    };
  }

  const table =
    document?.body?.source?.table ||
    document?.body?.report?.source?.table ||
    document?.body?.data?.table ||
    document?.source?.table;

  if (Array.isArray(document?.Rows)) {
    const columns = document.Cols || [];
    const rows = document.Rows.map((row) => {
      if (!Array.isArray(row)) {
        return row;
      }
      return Object.fromEntries(row.map((value, index) => [columns[index] || `col_${index}`, value]));
    });

    return {
      rows,
      columns,
      page: document.Page || null
    };
  }

  if (!table || !Array.isArray(table.rows)) {
    return {
      rows: [],
      page: table?.page || null,
      raw: document
    };
  }

  const columns = (table.cols || table.layout?.fields || []).map((col, index) => ({
    id: col.id || col.name || `col_${index}`,
    caption: col.caption || col.text || col.name || col.id || `col_${index}`
  }));

  const rows = table.rows.map((row) => {
    if (!Array.isArray(row)) {
      return row;
    }
    return Object.fromEntries(row.map((value, index) => [columns[index]?.id || `col_${index}`, value]));
  });

  return {
    rows,
    columns,
    page: table.page || null
  };
}

export function toBusinessView(viewName, normalized) {
  if (viewName === "sales_orders") {
    return {
      page: normalized.page,
      rows: normalized.rows.map(mapSalesOrder)
    };
  }

  if (viewName === "contract_detail") {
    const contract = normalized.rows[0] || {};
    return mapContractDetail(contract);
  }

  if (viewName === "inventory" || viewName === "inventory_details") {
    return {
      page: normalized.page,
      rows: normalized.rows.map(mapInventoryRow)
    };
  }

  if (viewName === "warehouses") {
    return {
      page: normalized.page,
      rows: normalized.rows.map(mapWarehouseRow)
    };
  }

  if (viewName === "products") {
    return {
      page: normalized.page,
      rows: normalized.rows.map(mapProductRow)
    };
  }

  if (viewName === "stock_in_records") {
    return {
      page: normalized.page,
      rows: normalized.rows.map(mapStockInRecord)
    };
  }

  if (viewName === "stock_in_details") {
    return {
      page: normalized.page,
      rows: normalized.rows.map(mapStockInDetail)
    };
  }

  if (viewName === "pmc_exceptions") {
    return {
      model: "pmc_exceptions",
      sections: {
        unshipped_orders: {
          page: normalized.sections.unshipped_contracts.page,
          rows: normalized.sections.unshipped_contracts.rows.map(mapSalesOrder)
        },
        unpaid_orders: {
          page: normalized.sections.unpaid_contracts.page,
          rows: normalized.sections.unpaid_contracts.rows.map(mapSalesOrder)
        }
      },
      notes: normalized.notes
    };
  }

  return normalized;
}

function mapSalesOrder(row) {
  return {
    erp_id: row.ord,
    order_no: row.htid,
    title: row.title,
    customer: row.khmc,
    owner: row.xsry,
    department_or_category: row.htfl,
    amount: parseMoney(row.moneyall),
    received_amount: parseMoney(row.hkmoney),
    currency: row.htbz,
    signed_date: row.dateQD,
    start_date: row.dateKS,
    end_date: row.dateZZ,
    approval_status: row.spzt,
    approver: row.spMan || null,
    warehouse_status: row.ckjz,
    delivery_status: row.fhjz,
    payment_status: row.skjz,
    invoice_status: row.kpjz,
    urgency: row.UrgentType,
    risk_flags: [
      row.ckjz === "未出库" ? "未出库" : null,
      row.fhjz === "未发货" ? "未发货" : null,
      row.skjz === "未收款" ? "未收款" : null,
      row.kpjz === "未开票" ? "未开票" : null,
      row.spzt && row.spzt !== "审批通过" ? row.spzt : null
    ].filter(Boolean),
    raw: row
  };
}

function mapContractDetail(row) {
  return {
    erp_id: row.Ord || row.ord || null,
    order_no: row.Htid || row.htid || null,
    title: row.Title || row.title || null,
    customer: row.CateName || row.cateName || null,
    owner: row.Person1 || row.person1 || null,
    signed_date: row.Date3 || row.date3 || null,
    delivery_date: row.Date7 || row.date7 || null,
    amount: parseMoney(firstValue(row.Money1, row.money1)),
    received_amount: parseMoney(firstValue(row.HkMoney1, row.hkMoney1)),
    approval_status: row.SpStatus || row.spStatus || null,
    detail_status: row.mZt1 || null,
    delivery_status: row.mZt2 || null,
    lines_count: Array.isArray(row.contractlist) ? row.contractlist.length : 0,
    lines: Array.isArray(row.contractlist) ? row.contractlist.map(mapContractLine) : [],
    raw: row
  };
}

function mapContractLine(row) {
  return {
    line_id: row.Ord || row.ord || row.ID || row.id || null,
    product_name: row.Title || row.title || row.CpName || row.cpname || null,
    product_code: row.Order1 || row.order1 || row.CpBh || row.cpbh || null,
    product_model: row.Type1 || row.type1 || row.CpXh || row.cpxh || null,
    unit: row.Unit || row.unit || row.UnitName || row.unitname || null,
    demand_qty: parseNumber(firstValue(row.Num1, row.num1, row.Num, row.num)),
    delivered_qty: parseNumber(firstValue(row.SendNum, row.sendNum, row.FhNum, row.fhnum)),
    remaining_qty: parseNumber(firstValue(row.LeftNum, row.leftNum, row.WfhNum, row.wfhnum)),
    delivery_date: row.Date1 || row.date1 || row.JhDate || row.jhdate || null,
    raw: row
  };
}

function mapInventoryRow(row) {
  return {
    product_name: row["产品名称"] || row.Title,
    product_code: row["产品编号"] || row["编号"] || row.Order1,
    product_model: row["产品型号"] || row["型号"] || row.Type1,
    product_category: row["产品分类"] || row.ProductSort,
    unit: row["基本单位"] || row["单位"] || row.UnitName || row.Unit,
    stock_qty: parseNumber(firstValue(row["库存数量"], row.Num2)),
    available_qty: parseNumber(firstValue(row["可用数量"], row.KYNum)),
    frozen_qty: parseNumber(firstValue(row["冻结数量"], row.DJNum)),
    reserved_qty: parseNumber(firstValue(row["预定数量"], row.YDNum)),
    in_transit_qty: parseNumber(firstValue(row["在途数量"], row.ZTNum)),
    warehouse: row["仓库"] || row.Ku,
    batch_no: row["批号"] || row.Ph,
    serial_no: row["序列号"] || row.Xlh,
    production_date: row["生产日期"] || null,
    expiry_date: row["有效日期"] || null,
    package: row["包装"] || null,
    pieces: parseNumber(row["件数"]),
    spec: row["规格/型号"] || null,
    finished_weight: parseNumber(row["成品重量"]),
    process: row["工段"] || null,
    location: row["库位"] || null,
    stock_age_days: parseNumber(row["库龄（天）"]),
    remark: row["备注"] || null,
    supplier: row["关联供应商"] || null,
    inbound_order: row["关联入库单"] || null,
    initial_inbound_time: row["初始入库时间"] || null,
    inbound_confirmed_time: row["入库确认时间"] || null,
    raw: row
  };
}

function mapWarehouseRow(row) {
  return {
    warehouse_id: row["仓库ID"] ?? row.Ord ?? row[0],
    name: row["仓库名称"] ?? row.Sort1 ?? row[1],
    importance: row["重要指数"] ?? row.Gate1 ?? row[2],
    status: row["状态"] ?? row.Del ?? row[3],
    barcode: row["条码"] ?? row.StoreCode ?? row[4],
    comment: row["备注"] ?? row.StoreComment ?? row[5],
    full_path: row["仓库对应全路径"] ?? row.FullPath ?? row[6],
    root_path: row["仓库对应根分类"] ?? row.RootPath ?? row[7],
    raw: row
  };
}

function mapProductRow(row) {
  return {
    erp_id: row.ord,
    product_name: row.cpname,
    product_code: row.cpbh,
    product_model: row.cpxh,
    unit: row.unitname,
    category: row.fenlei,
    raw: row
  };
}

function mapStockInRecord(row) {
  return {
    erp_id: row.ord,
    title: row.title,
    receipt_no: row.rkbh,
    quantity: parseNumber(row.rknum),
    warehouse_keeper: row.kgname,
    applicant: row.sqname,
    receipt_status: row.rkzt,
    receipt_type: row.rklb,
    application_time: row.datesq,
    confirmed_time: row.rkDate || null,
    warehouse_title: row.ckTitle || null,
    raw: row
  };
}

function mapStockInDetail(row) {
  return {
    erp_id: row.ord,
    line_id: row.id,
    product_name: row.title,
    product_code: row.order1,
    product_model: row.type1,
    unit: row.unitall,
    quantity: parseNumber(row.num1),
    base_quantity: parseNumber(row.num2),
    cost_price: parseMoney(row.cprice),
    cost_amount: parseMoney(row.cmoney),
    package: row.bz,
    batch_no: row.ph,
    production_date: row.datesc || null,
    expiry_date: row.dateyx || null,
    warehouse_path: row.fullPath || null,
    raw: row
  };
}

function mapProcedurePlanRow(row) {
  return {
    procedure_plan_id: row["工序计划ID"],
    work_assignment_id: row["派工单ID"],
    procedure_id: row["工序ID"],
    procedure_name: row["工序名称"],
    product_name: row["产品名称"],
    product_code: row["产品编号"],
    product_model: row["产品型号"],
    unit: row["汇报单位"],
    sequence: parseNumber(row["执行顺序"]),
    work_center_id: row["工作中心ID"],
    work_center_name: row["工作中心名称"],
    planned_qty: parseNumber(row["加工数量"]),
    qualified_qty: parseNumber(row["合格数量"]),
    rework_qty: parseNumber(row["返工数量"]),
    scrap_qty: parseNumber(row["报废数量"]),
    remaining_qty: parseNumber(row["剩余数量"]),
    owner: row["工序计划负责人"],
    planned_start_date: row["计划开工期"] || null,
    planned_finish_date: row["计划完工期"] || null,
    raw: row
  };
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
  const nameKey = normalizeKey(line.product_name);
  if (nameKey && index.byName.has(nameKey)) {
    return { ...index.byName.get(nameKey), matched_by: "product_name" };
  }
  return {
    stock_qty: 0,
    available_qty: 0,
    matched_by: null,
    matches: []
  };
}

function parseMoney(value) {
  return parseNumber(value);
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

function redactSession(document) {
  if (document?.header?.session) {
    document.header.session = "[redacted]";
  }
  return document;
}

function tableStatus(table, raw) {
  return {
    ok: raw?.header?.status === undefined ? true : Number(raw.header.status) === 0,
    rows: table.rows.length,
    page: table.page || null,
    message: raw?.header?.message || raw?.Msg || null,
    model: raw?.body?.model || null
  };
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isBeforeDay(value, date) {
  const parsed = parseDate(value);
  return parsed ? parsed < startOfDay(date) : false;
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

function normalizeKey(value) {
  return value === undefined || value === null ? "" : String(value).trim().toLowerCase();
}

function filterParams(params, allowedParams = []) {
  const allowed = new Set(allowedParams);
  return Object.fromEntries(Object.entries(params).filter(([key]) => allowed.has(key)));
}

function applyAliases(params, aliases = {}) {
  const mapped = { ...params };
  for (const [from, to] of Object.entries(aliases)) {
    if (mapped[from] !== undefined) {
      mapped[to] = mapped[from];
    }
    delete mapped[from];
  }
  return mapped;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function withTxtPrefix(value) {
  const text = String(value);
  return text.startsWith("txt:") ? text : `txt:${text}`;
}
