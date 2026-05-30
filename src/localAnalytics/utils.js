export function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row?.[key]).filter(Boolean)).size;
}

export function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getFullYear() < 2000 ? null : date;
}

export function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function sameDay(left, right) {
  return Boolean(left) && startOfDay(left).getTime() === startOfDay(right).getTime();
}

export function betweenDays(value, start, end) {
  if (!value) return false;
  const day = startOfDay(value).getTime();
  return day >= startOfDay(start).getTime() && day <= startOfDay(end).getTime();
}

export function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function number(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function round2(value) {
  return Number((number(value) || 0).toFixed(2));
}

export function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

export function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
