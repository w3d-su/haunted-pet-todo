import { HauntApp } from "@/components/providers/HauntApp";
import { Landing } from "@/components/ui/Landing";
import { demoModeEnabled } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const demoMode = demoModeEnabled();
  const canPlay = demoMode || Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!canPlay) return <Landing />;
  return <HauntApp demoMode={demoMode} />;
}
