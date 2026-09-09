import type { Metadata } from "next";
import { ensureSeedUsers } from "@/lib/auth";
import { googleEnabled } from "@/lib/oauth-google";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Criar conta — Sona",
  description: "Crie sua conta no Sona e comece a ouvir.",
};

export default async function RegisterPage() {
  await ensureSeedUsers();

  return (
    <AuthLayout>
      <RegisterForm googleEnabled={googleEnabled} />
    </AuthLayout>
  );
}
