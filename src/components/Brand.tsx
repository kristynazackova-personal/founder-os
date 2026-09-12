import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-bold tracking-tight">
      <span className="inline-block h-6 w-6 rounded-md bg-[var(--accent)]" aria-hidden />
      Founder OS
    </Link>
  );
}
