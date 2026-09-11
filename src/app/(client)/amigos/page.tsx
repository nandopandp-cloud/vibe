import { readFriends } from "@/lib/friends-actions";
import { FriendsScreen } from "@/components/client/FriendsScreen";

export const metadata = { title: "Amigos — Sona" };

export default async function FriendsPage() {
  const initial = await readFriends();
  return <FriendsScreen initial={initial} />;
}
