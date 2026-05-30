// Semi-finished inventory batch matching analytics.

import { normalizeKey, number } from "./utils.js";

export function buildSemiFinishedInventoryBatches(rows = []) {
  return rows
    .map((row) => {
      const stockQty = number(row.stock_qty) || 0;
      const availableQty = number(row.available_qty);
      return {
        ...row,
        stock_qty: stockQty,
        available_qty: availableQty === null ? stockQty : availableQty,
        product_name: row.product_name || "",
        product_code: row.product_code || "",
        product_model: row.product_model || row.spec || "",
        warehouse: row.warehouse || "",
        batch_no: row.batch_no || row.serial_no || row.inventory_id || ""
      };
    })
    .filter(isSemiFinishedInventoryBatch)
    .sort((a, b) => batchAvailableQty(b) - batchAvailableQty(a))
    .slice(0, 500);
}

function isSemiFinishedInventoryBatch(row = {}) {
  if (batchAvailableQty(row) <= 0) return false;
  const text = [row.warehouse, row.product_name, row.product_model, row.product_category, row.remark].filter(Boolean).join(" ");
  if (/废料|废品|废屑|边角|报废|残料/i.test(text)) return false;
  if (/带箔材产成品库|半成品|产成品|成品|板材|箔材|带材|钽铌库/i.test(text)) return true;
  return /板|箔|带|片|圆片/i.test([row.product_name, row.product_model].filter(Boolean).join(" "));
}

export function batchAvailableQty(row = {}) {
  const available = number(row.available_qty);
  if (available !== null) return available;
  return number(row.stock_qty) || 0;
}

export function findSemiFinishedBatchForDownstream(downstream, batches = []) {
  const requiredQty = downstreamRequiredQty(downstream);
  const candidates = batches
    .map((batch) => ({ batch, score: semiFinishedBatchScore(batch, downstream, requiredQty) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || batchAvailableQty(b.batch) - batchAvailableQty(a.batch));
  return candidates[0]?.batch || null;
}

function semiFinishedBatchScore(batch, downstream, requiredQty) {
  const availableQty = batchAvailableQty(batch);
  if (availableQty <= 0 || (requiredQty > 0 && availableQty < requiredQty)) return 0;
  let score = 0;
  if (normalizeKey(batch.product_code) && normalizeKey(batch.product_code) === normalizeKey(downstream.product_code)) score += 200;
  if (productTextMatches(batch, downstream)) score += 100;
  if (normalizeProductText(batch.product_model) && normalizeProductText(downstream.product_model) && normalizeProductText(batch.product_model) === normalizeProductText(downstream.product_model)) score += 40;
  if (/带箔材产成品库|半成品|产成品/.test(String(batch.warehouse || ""))) score += 10;
  return score;
}

function productTextMatches(batch, downstream) {
  const batchText = normalizeProductText([batch.product_name, batch.product_model, batch.spec].filter(Boolean).join(" "));
  const downstreamText = normalizeProductText([downstream.product_name, downstream.product_model].filter(Boolean).join(" "));
  if (!batchText || !downstreamText) return false;
  return batchText.includes(downstreamText) || downstreamText.includes(batchText) || sharedMaterialToken(batchText, downstreamText);
}

function sharedMaterialToken(left, right) {
  const tokens = ["钼箔", "钼板", "钼带", "钨箔", "钨板", "钨带", "钽箔", "钽板", "钽带", "铌箔", "铌板", "铌带"];
  return tokens.some((token) => left.includes(token) && right.includes(token));
}

function normalizeProductText(value) {
  return String(value || "").replace(/\s+/g, "").replace(/[×*xX]/g, "x").toUpperCase();
}

function downstreamRequiredQty(row) {
  const remaining = number(row.remaining_qty);
  if (remaining !== null && remaining > 0) return remaining;
  const planned = number(row.planned_qty);
  return planned !== null && planned > 0 ? planned : 0;
}
