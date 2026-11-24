import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/screen-links";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // الشاشة والمستأجر يديران جلستهما داخل المتصفح، وبطاقة الضيف عامة
  if (pathname === "/play" || pathname.startsWith("/play/") || pathname.startsWith("/r/") || pathname.startsWith("/b/") || pathname.startsWith("/q/")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = Boolean(user && !user.is_anonymous);

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    const [path, search = ""] = target.split("?");
    url.pathname = path;
    url.search = search;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (pathname.startsWith("/auth/")) return response;
  if (!signedIn && pathname !== "/login") {
    const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`);
    return redirectTo(`/login?next=${next}`);
  }
  if (signedIn && pathname === "/login") {
    return redirectTo(safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/dashboard");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|sounds|player.webmanifest|admin.webmanifest|sw.js).*)"],
};
