import { redirect } from "next/navigation";
import { readDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { PlayerProvider } from "@/components/client/PlayerProvider";
import { Shell } from "@/components/client/Shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  // O middleware já barra quem não tem cookie; isto cobre o cookie
  // adulterado ou de um usuário que não existe mais.
  if (!user) redirect("/entrar");

  const db = await readDb();
  const playlists = [...db.playlists].sort((a, b) =>
    a.title.localeCompare(b.title, "pt-BR"),
  );

  return (
    <PlayerProvider initialLiked={db.liked[user.id] ?? []}>
      <Shell playlists={playlists} user={user}>
        {children}
      </Shell>
    </PlayerProvider>
  );
}
