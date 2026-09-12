import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Optimistic redirect for signed-out visitors; real auth happens in each page/action. */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("fos_session");
  if (!hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/billing"],
};
