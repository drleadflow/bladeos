import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "@/components/blade/CalendarPage";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Schedule // Blade Command" }] }),
  component: CalendarPage,
});
