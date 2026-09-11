import { readFriends, readPeopleDirectory } from "@/lib/friends-actions";
import { FriendsScreen } from "@/components/client/FriendsScreen";

export const metadata = { title: "Amigos — Sona" };

export default async function FriendsPage() {
  // As duas leituras compartilham o `readDb` memoizado da requisição, então
  // em paralelo elas custam o mesmo que uma.
  const [initial, directory] = await Promise.all([
    readFriends(),
    readPeopleDirectory(0),
  ]);

  return <FriendsScreen initial={initial} directory={directory} />;
}
