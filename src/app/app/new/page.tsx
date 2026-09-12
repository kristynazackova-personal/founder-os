import { NewAppForm } from "@/components/NewAppForm";

export default function NewAppPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight">Connect your app</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">This is a diagnosis, not a form. Three things about the app, then we read your payment data and place you on the ladder.</p>
      <div className="mt-6">
        <NewAppForm />
      </div>
    </div>
  );
}
