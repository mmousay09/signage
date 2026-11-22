/** رابط واتساب برقم ليبي أو دولي ورسالة جاهزة */
export function whatsappLink(phone: string | null | undefined, message: string) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `218${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
