import { createFileRoute } from "@tanstack/react-router";
import { IntelPage } from "@/components/blade/IntelPage";

export const Route = createFileRoute("/intel")({
  head: () => ({ meta: [{ title: "Intelligence // Blade Command" }] }),
  component: IntelPage,
});
