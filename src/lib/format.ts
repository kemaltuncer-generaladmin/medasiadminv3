export function fmtDate(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function fmtDateShort(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { dateStyle: "medium" });
}

export function fmtRelative(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} sa önce`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} gün önce`;
  return d.toLocaleDateString("tr-TR", { dateStyle: "medium" });
}

export function fmtMoney(value: unknown, currency = "TRY") {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString("tr-TR", { style: "currency", currency });
}
