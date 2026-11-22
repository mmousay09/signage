import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// مسح رمز QR من الشاشة: يُسجَّل المسح ثم يُفتح رابط العميل
export async function GET(request: NextRequest, { params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;
  const screen = request.nextUrl.searchParams.get("s");
  if (!UUID.test(contract)) return new NextResponse("الرابط غير صحيح", { status: 404 });

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data } = await supabase.rpc("record_qr_scan", {
    p_contract: contract,
    p_screen: screen && UUID.test(screen) ? screen : null,
  });
  const target = typeof data === "string" && /^https?:\/\//i.test(data) ? data : null;
  if (!target) return new NextResponse("انتهى هذا الرابط", { status: 404 });
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store" } });
}
