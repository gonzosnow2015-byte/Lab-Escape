import { createFileRoute } from "@tanstack/react-router";
import { MonchelGame } from "@/components/monchel-game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <MonchelGame />;
}
