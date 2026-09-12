import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { Brand } from "@/components/Brand";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  const target = next && next.startsWith("/") ? next : "/app";
  if (user) redirect(target);
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <Brand />
      <div className="mt-10">
        <AuthForm mode="login" next={target} />
      </div>
    </main>
  );
}
