import { createFileRoute } from "@tanstack/react-router";
import { CommandPage } from "@/components/blade/CommandPage";

export const Route = createFileRoute("/")({
  component: CommandPage,
});
