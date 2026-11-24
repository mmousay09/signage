/** لغة التواريخ في لوحة التحكم: الإنجليزية إن اختارها المستخدم (تُعرف في المتصفح فقط) */
export function uiLocale(arabic = "ar-LY-u-nu-latn") {
  return typeof document !== "undefined" && document.documentElement.lang === "en" ? "en-GB" : arabic;
}
