// Order battle-map analytics.

import {
  daysBetween,
  number,
  parseDate,
  startOfDay
} from "./utils.js";

const BATTLE_STAGES = ["熔炼", "轧制", "机加工", "热处理", "表面处理", "质检", "包装", "待发"];

export function buildOrderBattleMap(rows, today) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.order_no || row.work_assignment_id || row.product_name || "未关联";
    const current = grouped.get(key) || {
      order_no: row.order_no || row.work_assignment_id || "未关联订单",
      work_assignment_id: row.work_assignment_id,
      product_name: row.product_name,
      current_stage: "",
      blocker: "",
      red_nodes: 0,
      yellow_nodes: 0,
      remaining_qty: 0,
      planned_finish_date: row.planned_finish_date || ""
    };
    const stage = battleStageForProcedure(row);
    const cellKey = `stage_${stage}`;
    const existing = current[cellKey] || emptyBattleCell(stage);
    current[cellKey] = mergeBattleCell(existing, row, today);
    current.remaining_qty += number(row.remaining_qty) || 0;
    if (row.planned_finish_date && (!current.planned_finish_date || String(row.planned_finish_date) < String(current.planned_finish_date))) {
      current.planned_finish_date = row.planned_finish_date;
    }
    grouped.set(key, current);
  }

  const rowsOut = [...grouped.values()].map((row) => {
    for (const stage of BATTLE_STAGES) {
      const key = `stage_${stage}`;
      row[key] = row[key] || emptyBattleCell(stage);
      if (row[key].status === "red") row.red_nodes += 1;
      if (row[key].status === "yellow") row.yellow_nodes += 1;
    }
    const currentCell = BATTLE_STAGES.map((stage) => row[`stage_${stage}`]).find((cell) => cell.status === "red")
      || BATTLE_STAGES.map((stage) => row[`stage_${stage}`]).find((cell) => cell.status === "yellow")
      || BATTLE_STAGES.map((stage) => row[`stage_${stage}`]).find((cell) => cell.status === "active")
      || BATTLE_STAGES.map((stage) => row[`stage_${stage}`]).find((cell) => cell.status === "done");
    row.current_stage = currentCell?.stage || "";
    row.blocker = currentCell?.problem || "";
    return row;
  })
    .sort((a, b) => b.red_nodes - a.red_nodes || b.yellow_nodes - a.yellow_nodes || String(a.planned_finish_date || "").localeCompare(String(b.planned_finish_date || "")))
    .slice(0, 30);

  return {
    stages: BATTLE_STAGES,
    rows: rowsOut,
    summary: battleStageSummary(rowsOut),
    red_nodes: rowsOut.reduce((sum, row) => sum + row.red_nodes, 0),
    yellow_nodes: rowsOut.reduce((sum, row) => sum + row.yellow_nodes, 0)
  };
}

function battleStageSummary(rows) {
  return BATTLE_STAGES.map((stage) => {
    const cells = rows.map((row) => row[`stage_${stage}`] || emptyBattleCell(stage));
    return {
      stage,
      red_nodes: cells.filter((cell) => cell.status === "red").length,
      yellow_nodes: cells.filter((cell) => cell.status === "yellow").length,
      active_nodes: cells.filter((cell) => cell.status === "active").length,
      done_nodes: cells.filter((cell) => cell.status === "done").length,
      total_nodes: cells.filter((cell) => cell.status !== "none").length
    };
  })
    .filter((row) => row.total_nodes > 0 || row.red_nodes > 0 || row.yellow_nodes > 0)
    .sort((a, b) => b.red_nodes - a.red_nodes || b.yellow_nodes - a.yellow_nodes || b.active_nodes - a.active_nodes || BATTLE_STAGES.indexOf(a.stage) - BATTLE_STAGES.indexOf(b.stage));
}

function emptyBattleCell(stage) {
  return {
    stage,
    status: "none",
    label: "○",
    procedure_name: "",
    work_center_name: "",
    remaining_qty: "",
    planned_finish_date: "",
    problem: ""
  };
}

function mergeBattleCell(cell, row, today) {
  const next = battleCellForProcedure(row, today);
  return battleStatusWeight(next.status) >= battleStatusWeight(cell.status) ? next : cell;
}

function battleCellForProcedure(row, today) {
  const remaining = number(row.remaining_qty) || 0;
  const finishDate = parseDate(row.planned_finish_date);
  let status = remaining <= 0 ? "done" : "active";
  if (remaining > 0 && finishDate && startOfDay(finishDate) < today) {
    status = "red";
  } else if (remaining > 0 && finishDate && daysBetween(today, startOfDay(finishDate)) <= 3) {
    status = "yellow";
  }
  const stage = battleStageForProcedure(row);
  return {
    stage,
    status,
    label: battleStatusLabel(status),
    order_no: row.order_no || "",
    work_assignment_id: row.work_assignment_id || "",
    procedure_name: row.procedure_name || "",
    work_center_name: row.work_center_name || "",
    remaining_qty: row.remaining_qty,
    planned_finish_date: row.planned_finish_date || "",
    problem: battleProblemText(status, row)
  };
}

function battleStageForProcedure(row) {
  const text = [row.procedure_name, row.work_center_name].filter(Boolean).join(" ");
  if (/熔炼|烧结|真空炉/.test(text)) return "熔炼";
  if (/轧|辊|压延/.test(text)) return "轧制";
  if (/热处理|退火|时效|淬火|回火/.test(text)) return "热处理";
  if (/表面|酸洗|喷砂|抛光|清洗|镀/.test(text)) return "表面处理";
  if (/质检|检验|检测|探伤|品检/.test(text)) return "质检";
  if (/包装|入库|打包/.test(text)) return "包装";
  if (/待发|发货|出库/.test(text)) return "待发";
  return "机加工";
}

function battleStatusWeight(status) {
  if (status === "red") return 4;
  if (status === "yellow") return 3;
  if (status === "active") return 2;
  if (status === "done") return 1;
  return 0;
}

function battleStatusLabel(status) {
  if (status === "red") return "●红";
  if (status === "yellow") return "●黄";
  if (status === "active") return "●";
  if (status === "done") return "✓";
  return "○";
}

function battleProblemText(status, row) {
  if (status === "red") return `${row.procedure_name || "工序"}已延期`;
  if (status === "yellow") return `${row.procedure_name || "工序"}临近计划完工`;
  if (status === "active") return `${row.procedure_name || "工序"}进行中`;
  if (status === "done") return `${row.procedure_name || "工序"}已完成`;
  return "";
}
