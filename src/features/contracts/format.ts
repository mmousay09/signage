export type ContractStatus = "draft" | "confirmed" | "cancelled";

export function contractState(status: ContractStatus, startsAt: string, endsAt: string, now: number) {
  if (status === "cancelled") return { key: "cancelled", label: "ملغي" };
  if (status === "draft") return { key: "draft", label: "مسودة" };
  if (now >= Date.parse(endsAt)) return { key: "ended", label: "منتهٍ" };
  if (now >= Date.parse(startsAt)) return { key: "active", label: "جارٍ الآن" };
  return { key: "upcoming", label: "قادم" };
}

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ar-LY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function toLocalInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
