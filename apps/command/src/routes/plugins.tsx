import { createFileRoute } from "@tanstack/react-router";
import { PluginsPage } from "../components/blade/PluginsPage";

export const Route = createFileRoute("/plugins")({
  head: () => ({ meta: [{ title: "Plugins // Blade Command" }] }),
  component: PluginsPage,
});
