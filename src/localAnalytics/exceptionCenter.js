import {
  deliveryTasks,
  lowStockTasks,
  priorityWeight,
  shortageTasks
} from "./pmcRisks.js";

export function buildLocalExceptionCenter(dashboard) {
  const sections = dashboard.sections || {};
  const tasks = [
    ...deliveryTasks(sections.overdue_orders || [], "交期逾期"),
    ...deliveryTasks(sections.due_soon_orders || [], "临期交付"),
    ...shortageTasks(sections.shortage_orders || []),
    ...lowStockTasks(sections.low_stock || [])
  ]
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || String(a.due_date || "").localeCompare(String(b.due_date || "")))
    .slice(0, 80)
    .map((task, index) => ({ task_no: `PMC-${String(index + 1).padStart(3, "0")}`, ...task }));

  return {
    model: "exception_center",
    generated_at: new Date().toISOString(),
    cached: true,
    summary: {
      open_tasks: tasks.length,
      critical_tasks: tasks.filter((task) => task.priority === "高").length,
      overdue_orders: dashboard.summary?.overdue_orders || 0,
      due_soon_orders: dashboard.summary?.due_soon_orders || 0,
      shortage_orders: dashboard.summary?.shortage_orders || 0,
      low_stock: dashboard.summary?.low_stock || 0
    },
    sections: {
      overdue_orders: sections.overdue_orders || [],
      due_soon_orders: sections.due_soon_orders || [],
      shortage_rows: sections.shortage_orders || [],
      low_stock: sections.low_stock || [],
      tasks
    },
    source_status: dashboard.source_status || {},
    notes: [
      "当前读取本地 SQLite 汇总生成 PMC 待响应风险。",
      "ERP 不可用时，PMC 继续使用最近同步成功的数据。"
    ]
  };
}
