import { requireAdminPage } from "@/lib/auth";
import { getAdminData } from "@/lib/data";
import { claimWindowInfo } from "@/lib/time";
import { aboutMeByPlayer } from "@/lib/aboutMe";
import AdminDashboard from "./AdminDashboard";

export const metadata = { title: "Admin | Lootbox Mania", robots: { index: false } };

export default async function AdminPage() {
  const user = await requireAdminPage(); // real check; middleware redirect is only a convenience
  const windowInfo = claimWindowInfo();
  const data = await getAdminData(windowInfo.key);
  // Personal form answers: loaded here, after the admin check, so they never reach public pages.
  const about = aboutMeByPlayer(data.players.filter((p) => p.active));
  return <AdminDashboard email={user.email ?? ""} windowInfo={windowInfo} about={about} {...data} />;
}
