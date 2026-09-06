import type { Metadata } from "next";
import { ensureSeedUsers } from "@/lib/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Entrar — Sona",
  description: "Faça login para continuar ouvindo no Sona.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Garante que existam contas na primeira execução.
  await ensureSeedUsers();

  const { next = "/" } = await searchParams;

  return (
    <AuthLayout>
      <LoginForm next={next} />
    </AuthLayout>
  );
}
