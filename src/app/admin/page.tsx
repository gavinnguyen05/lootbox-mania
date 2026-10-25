import { requireAdminPage } from "@/lib/auth";
import { getAdminData } from "@/lib/data";
import { claimWindowInfo } from "@/lib/time";
import AdminDashboard from "./AdminDashboard";

export const metadata = { title: "Admin | Lootbox Mania", robots: { index: false } };

export default async function AdminPage() {
  const user = await requireAdminPage(); // real check; middleware redirect is only a convenience
  const windowInfo = claimWindowInfo();
  const data = await getAdminData(windowInfo.key);
  return <AdminDashboard email={user.email ?? ""} windowInfo={windowInfo} {...data} />;
}
