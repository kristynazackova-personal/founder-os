import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { Brand } from "@/components/Brand";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-4 sm:gap-6">
            <Brand href="/app" />
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/app" className="hover:underline">
                Apps
              </Link>
              <Link href="/billing" className="hover:underline">
                Billing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {/* The address is useful context, not navigation - it goes first when space is short. */}
            <span className="hidden max-w-[45vw] truncate text-[var(--muted)] sm:inline">{user.email}</span>
            <form action={logoutAction}>
              <button className="btn btn-secondary py-1.5">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
