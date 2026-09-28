import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { COOKIE, validEntry, validSession } from "@/lib/admin-auth";
import AdminDashboard from "@/components/admin/AdminDashboard";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "데이터 관리",
  robots: { index: false, follow: false },
};
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ entry: string }>;
}) {
  const { entry } = await params;
  if (!validEntry(entry)) notFound();
  if (!validSession((await cookies()).get(COOKIE)?.value))
    redirect(`/${entry}/enter`);
  return <AdminDashboard readOnly={process.env.VERCEL_ENV === "preview"} />;
}
