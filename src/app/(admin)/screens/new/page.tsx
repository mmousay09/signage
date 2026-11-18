import { PairForm } from "@/features/screens/PairForm";
import { getAdminContext } from "@/lib/admin";

export default async function NewScreenPage() {
  const { org } = await getAdminContext();
  return <PairForm orgId={org.id} />;
}
