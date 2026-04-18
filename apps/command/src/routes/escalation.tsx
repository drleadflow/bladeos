import { createFileRoute } from "@tanstack/react-router";
import { EscalationPage } from "../components/blade/EscalationPage";

export const Route = createFileRoute("/escalation")({
  head: () => ({ meta: [{ title: "Escalation // Blade Command" }] }),
  component: EscalationPage,
});
