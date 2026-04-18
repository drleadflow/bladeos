import { createFileRoute } from "@tanstack/react-router";
import { GoalsPage } from "../components/blade/GoalsPage";

export const Route = createFileRoute("/goals")({
  head: () => ({ meta: [{ title: "Goals // Blade Command" }] }),
  component: GoalsPage,
});
