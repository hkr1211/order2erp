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
    kind: "modern",
    path: "/webapi/apiHelper/produce/ProcedureProgre/GetProcedureProgres",
    defaultParams: {},
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

  async callAsp(path, params = {}, cmdkey = "refresh") {
    const session = await this.ensureSession();
    const payload = {
      session,
      cmdkey,
      datas: Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([id, val]) => ({ id, val }))
    };
    return this.postJson(path, payload);
  }

  async callModern(path, params = {}) {
    const session = await this.ensureSession();
    return this.postJson(path, params, { "ZBAPI-Token": session });
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
}

export function normalizeTable(document) {
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

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
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
