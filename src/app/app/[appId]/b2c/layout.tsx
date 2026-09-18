/**
 * B2C analytics - the consumer funnel for the founder's own app, added
 * alongside the existing Diagnosis and Attribution pages rather than
 * replacing either. Those answer "what stage am I at" and "which channel
 * paid"; this answers "what happens to the people who arrive".
 */
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { B2cNav } from "./B2cNav";

export default async function B2cLayout({ children, params }: { children: React.ReactNode; params: Promise<{ appId: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  return (
    <div className="flex flex-col gap-5">
      <B2cNav appId={app.id} />
      {children}
    </div>
  );
}
