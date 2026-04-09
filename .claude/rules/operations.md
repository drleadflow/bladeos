# Operations Rules

## Deployments
Never deploy without passing tests and lint. Use dedicated commands
(e.g., `/deploy-staging`) instead of raw CLI tools. Log which agent
performed which deploy with which manifest version.

## Destructive Actions
Never run destructive DB migrations without backups. Never force-push
to main/master. Never delete production data. Always confirm with the
user before irreversible operations.

## Resource Safety
Check resource usage before expensive operations (Docker builds,
large test suites, bulk API calls). Set timeouts on long-running
processes. Clean up temporary files and containers after use.
