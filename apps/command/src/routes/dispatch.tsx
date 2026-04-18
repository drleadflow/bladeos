import { createFileRoute } from "@tanstack/react-router";
import { DispatchPage } from "@/components/blade/DispatchPage";

export const Route = createFileRoute("/dispatch")({
  head: () => ({ meta: [{ title: "Dispatch // Blade Command" }] }),
  component: DispatchPage,
});
