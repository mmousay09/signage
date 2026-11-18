import { PairForm } from "@/features/screens/PairForm";
import { getAdminContext } from "@/lib/admin";
import { isPairingCode } from "@/lib/screen-links";

export default async function NewScreenPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[]; scan?: string | string[] }>;
}) {
  const [{ org }, params] = await Promise.all([getAdminContext(), searchParams]);
  return (
    <PairForm
      orgId={org.id}
      initialCode={isPairingCode(params.code) ? params.code : ""}
      startScanning={params.scan === "1"}
    />
  );
}
