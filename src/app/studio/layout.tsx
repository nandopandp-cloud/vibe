import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { StudioShell } from "@/components/studio/StudioShell";

export const metadata: Metadata = {
  title: "Sona Studio",
  description: "Publique e gerencie o catálogo do Sona.",
};

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar?next=/studio");
  // Ouvintes que digitarem a URL voltam para a área deles.
  if (user.role !== "admins") redirect("/");

  return <StudioShell user={user}>{children}</StudioShell>;
}
