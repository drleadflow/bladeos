import { createFileRoute } from "@tanstack/react-router";
import { MemoryPage } from "@/components/blade/MemoryPage";

export const Route = createFileRoute("/memory")({
  head: () => ({ meta: [{ title: "Memory // Blade Command" }] }),
  component: MemoryPage,
});
