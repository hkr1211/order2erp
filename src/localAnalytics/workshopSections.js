// Shared workshop section definitions and classification.

export const WORKSHOP_SECTIONS = [
  { key: "rolling", title: "轧制", page_path: "/workshop-board/rolling", description: "轧机、冷轧、带材等轧制计划" },
  { key: "stamping", title: "冲压", page_path: "/workshop-board/stamping", description: "冲压、落料、冲圆、引伸、切边等计划" },
  { key: "tungsten_molybdenum", title: "钨钼", page_path: "/workshop-board/tungsten-molybdenum", description: "钨钼加工与机加工计划" }
];

export function classifyWorkshopSection(row = {}) {
  const text = [
    row.work_center_name,
    row.procedure_name,
    row.product_name,
    row.product_model,
    row.product_category
  ].filter(Boolean).join(" ");
  if (/轧|轧机|四辊|冷轧|带材/i.test(text)) return WORKSHOP_SECTIONS[0];
  if (/冲压|冲床|落料|冲圆|引伸|拉伸|拉深|切边|整形|冲头|冲铆|压形|压型|成型|一引|二引|三引|四引|五引|六引/i.test(text)) return WORKSHOP_SECTIONS[1];
  return WORKSHOP_SECTIONS[2];
}
