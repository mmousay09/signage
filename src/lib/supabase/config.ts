// قيم عامة تصل إلى متصفح كل مستخدم، والحماية الفعلية في سياسات RLS.
// لا تضع هنا مفتاح sb_secret أبدًا.
export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://yleojbmhgxrfrgasrgdn.supabase.co";
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_QMvPySt07Qr15ch7OZ7AsQ_5vdSOUwP";
