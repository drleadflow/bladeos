import { createFileRoute } from "@tanstack/react-router";
import { ReportingPage } from "../components/blade/ReportingPage";

export const Route = createFileRoute("/reporting")({
  head: () => ({ meta: [{ title: "Reporting // Blade Command" }] }),
  component: ReportingPage,
});
