import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { AppSettingsForm } from "@/components/AppSettingsForm";
import { PageHeader } from "@/components/ui";

export default async function SettingsPage({ params }: { params: Promise<{ appId: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  return (
    <div className="max-w-xl">
      <PageHeader title="App settings" />
      <AppSettingsForm app={app} />
      <p className="help mt-4">
        Site key: <code className="break-anywhere">{app.siteKey}</code>
      </p>
    </div>
  );
}
