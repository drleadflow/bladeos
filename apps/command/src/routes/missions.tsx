import { createFileRoute } from "@tanstack/react-router";
import { MissionsPage } from "@/components/blade/MissionsPage";

export const Route = createFileRoute("/missions")({
  head: () => ({ meta: [{ title: "Missions // Blade Command" }] }),
  component: MissionsPage,
});
