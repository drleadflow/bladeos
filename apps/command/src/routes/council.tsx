import { createFileRoute } from "@tanstack/react-router";
import { CouncilPage } from "@/components/blade/CouncilPage";

export const Route = createFileRoute("/council")({
  head: () => ({ meta: [{ title: "Council // Blade Command" }] }),
  component: CouncilPage,
});
