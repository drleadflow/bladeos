CREATE TABLE "achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unlocked_at" text
);
--> statement-breakpoint
CREATE TABLE "active_employees" (
	"employee_id" text PRIMARY KEY NOT NULL,
	"activated_at" text DEFAULT now() NOT NULL,
	"archetype" text NOT NULL,
	"onboarding_complete" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "active_workspaces" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"activated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"summary" text NOT NULL,
	"detail_json" text,
	"conversation_id" text,
	"job_id" text,
	"cost_usd" real DEFAULT 0,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"requested_by" text NOT NULL,
	"action" text NOT NULL,
	"tool_name" text,
	"tool_input_json" text,
	"context" text,
	"priority" text DEFAULT 'medium',
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" text,
	"expires_at" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_password" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hashed_password" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" integer NOT NULL,
	"user_id" text NOT NULL,
	"active_workspace_id" text
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "channel_links" (
	"conversation_id" text NOT NULL,
	"channel" text NOT NULL,
	"channel_id" text NOT NULL,
	"metadata_json" text DEFAULT '{}',
	"linked_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "channel_links_channel_channel_id_pk" PRIMARY KEY("channel","channel_id")
);
--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"slack_channel_id" text,
	"slack_channel_name" text,
	"service_type" text DEFAULT 'ads' NOT NULL,
	"industry" text,
	"monthly_retainer_usd" real DEFAULT 0,
	"platforms_json" text DEFAULT '{}' NOT NULL,
	"kpi_targets_json" text DEFAULT '[]' NOT NULL,
	"health_score" integer DEFAULT 0,
	"health_status" text DEFAULT 'unknown',
	"last_health_check_at" text,
	"last_report_at" text,
	"last_alert_at" text,
	"notes" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "client_accounts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "client_health_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"health_score" integer NOT NULL,
	"health_status" text NOT NULL,
	"metrics_json" text DEFAULT '{}' NOT NULL,
	"alerts_json" text,
	"checked_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_captions" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"platform" text NOT NULL,
	"caption" text NOT NULL,
	"hashtags" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" text,
	"published_url" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"video_url" text,
	"video_key" text,
	"thumbnail_url" text,
	"duration_seconds" real,
	"file_size_bytes" integer,
	"transcript" text,
	"transcript_segments" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"video_count" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"caption_id" text,
	"platform" text NOT NULL,
	"scheduled_at" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"published_url" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"workspace_id" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"input_cost_usd" real NOT NULL,
	"output_cost_usd" real NOT NULL,
	"total_cost_usd" real NOT NULL,
	"job_id" text,
	"conversation_id" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csm_evals" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"eval_date" text NOT NULL,
	"health_check_ran" integer DEFAULT 0,
	"decline_detected" integer DEFAULT 0,
	"decline_detection_latency_hours" real,
	"alert_delivered" integer DEFAULT 0,
	"report_generated" integer DEFAULT 0,
	"cost_usd" real DEFAULT 0,
	"details_json" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_priorities" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"emoji" text DEFAULT '⚡',
	"urgency" text DEFAULT 'normal',
	"completed" integer DEFAULT 0 NOT NULL,
	"date" text DEFAULT CURRENT_DATE NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"pillar" text NOT NULL,
	"description" text NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"active" integer DEFAULT 0 NOT NULL,
	"archetype" text,
	"onboarding_answers_json" text DEFAULT '{}' NOT NULL,
	"department" text DEFAULT 'general',
	"objective" text,
	"manager_id" text,
	"allowed_tools_json" text DEFAULT '[]',
	"blocked_tools_json" text DEFAULT '[]',
	"model_preference" text DEFAULT 'standard',
	"max_budget_per_run" real DEFAULT 1,
	"max_concurrent_runs" integer DEFAULT 1,
	"escalation_policy_json" text,
	"handoff_rules_json" text DEFAULT '[]',
	"memory_scope" text DEFAULT 'own',
	"output_channels_json" text DEFAULT '["web"]',
	"status" text DEFAULT 'active',
	"total_runs" integer DEFAULT 0,
	"total_cost_usd" real DEFAULT 0,
	"success_rate" real DEFAULT 0,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "employees_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "evolution_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"before_value" text,
	"after_value" text,
	"impact" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"from_employee" text NOT NULL,
	"to_employee" text NOT NULL,
	"reason" text NOT NULL,
	"context" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "improvement_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "job_evals" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tests_passed" integer DEFAULT 0,
	"tests_failed" integer DEFAULT 0,
	"tests_skipped" integer DEFAULT 0,
	"fix_cycles_used" integer DEFAULT 0,
	"max_fix_cycles" integer DEFAULT 3,
	"lint_errors" integer DEFAULT 0,
	"type_errors" integer DEFAULT 0,
	"files_changed" integer DEFAULT 0,
	"lines_added" integer DEFAULT 0,
	"lines_removed" integer DEFAULT 0,
	"total_cost_usd" real DEFAULT 0,
	"total_input_tokens" integer DEFAULT 0,
	"total_output_tokens" integer DEFAULT 0,
	"total_tool_calls" integer DEFAULT 0,
	"total_iterations" integer DEFAULT 0,
	"duration_ms" integer DEFAULT 0,
	"coding_duration_ms" integer DEFAULT 0,
	"testing_duration_ms" integer DEFAULT 0,
	"language" text,
	"repo_url" text,
	"agent_model" text,
	"stop_reason" text,
	"pr_merged" integer DEFAULT 0,
	"pr_review_comments" integer DEFAULT 0,
	"pr_time_to_merge_ms" integer,
	"details_json" text,
	"evaluated_at" text DEFAULT now() NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"data_json" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"repo_url" text NOT NULL,
	"branch" text NOT NULL,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"container_name" text,
	"pr_url" text,
	"pr_number" integer,
	"agent_model" text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
	"total_cost_usd" real DEFAULT 0,
	"total_tool_calls" integer DEFAULT 0,
	"total_iterations" integer DEFAULT 0,
	"error" text,
	"workspace_id" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "kpi_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_json" text NOT NULL,
	"target" real NOT NULL,
	"unit" text DEFAULT 'count' NOT NULL,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"direction" text DEFAULT 'higher_is_better' NOT NULL,
	"thresholds_json" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"kpi_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"value" real NOT NULL,
	"status" text DEFAULT 'green' NOT NULL,
	"measured_at" text DEFAULT now() NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "lead_engagement" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"contact_name" text,
	"first_outbound_at" text,
	"first_outbound_body" text,
	"first_outbound_source" text,
	"first_inbound_at" text,
	"replied_to_intro" integer DEFAULT 0,
	"replied_to_followup" integer DEFAULT 0,
	"is_responded" integer DEFAULT 0,
	"is_booked" integer DEFAULT 0,
	"is_dead" integer DEFAULT 0,
	"total_inbound" integer DEFAULT 0,
	"total_outbound" integer DEFAULT 0,
	"engagement_status" text DEFAULT 'new',
	"workflow_name" text,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text,
	"contact_id" text NOT NULL,
	"event_type" text NOT NULL,
	"channel" text,
	"direction" text,
	"handler" text,
	"message_body" text,
	"source" text,
	"metadata_json" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"tags_json" text DEFAULT '[]' NOT NULL,
	"source" text NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" text,
	"workspace_id" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitor_id" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"value" text,
	"acknowledged" integer DEFAULT 0 NOT NULL,
	"acknowledged_by" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"employee_id" text,
	"source_type" text NOT NULL,
	"source_config_json" text NOT NULL,
	"check_schedule" text NOT NULL,
	"thresholds_json" text,
	"last_checked_at" text,
	"last_value" text,
	"last_status" text DEFAULT 'unknown',
	"enabled" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"read" integer DEFAULT 0 NOT NULL,
	"employee_slug" text,
	"workspace_id" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"schedule" text NOT NULL,
	"task" text NOT NULL,
	"tools_json" text DEFAULT '[]',
	"output_channel" text DEFAULT 'web',
	"timeout_seconds" integer DEFAULT 300,
	"enabled" integer DEFAULT 1 NOT NULL,
	"last_run_at" text,
	"next_run_at" text,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_status" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecard_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"metric_id" text NOT NULL,
	"value" real NOT NULL,
	"status" text NOT NULL,
	"recorded_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"system_prompt" text NOT NULL,
	"tools_json" text DEFAULT '[]' NOT NULL,
	"examples_json" text DEFAULT '[]' NOT NULL,
	"success_rate" real DEFAULT 0.5 NOT NULL,
	"total_uses" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'builtin' NOT NULL,
	"workspace_id" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "skills_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_checked_in" text NOT NULL,
	"employee_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"input_json" text NOT NULL,
	"success" integer DEFAULT 0 NOT NULL,
	"result_json" text,
	"display" text,
	"duration_ms" integer DEFAULT 0,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"name" text NOT NULL,
	"worker_type" text DEFAULT 'claude_code' NOT NULL,
	"runtime" text DEFAULT 'pending' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"repo_url" text,
	"branch" text,
	"container_name" text,
	"conversation_id" text,
	"entrypoint" text,
	"latest_summary" text,
	"metadata_json" text DEFAULT '{}',
	"last_seen_at" text,
	"started_at" text,
	"completed_at" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "worker_sessions_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"step_results_json" text DEFAULT '{}' NOT NULL,
	"total_cost" real DEFAULT 0 NOT NULL,
	"started_at" text DEFAULT now() NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"repo_url" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"local_path" text NOT NULL,
	"status" text DEFAULT 'cloning' NOT NULL,
	"owner_chat_id" text,
	"last_command" text,
	"last_command_at" text,
	"total_commands" integer DEFAULT 0,
	"total_commits" integer DEFAULT 0,
	"total_prs" integer DEFAULT 0,
	"error" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"xp" integer NOT NULL,
	"employee_id" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_workspaces" ADD CONSTRAINT "active_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_password" ADD CONSTRAINT "auth_password_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_active_workspace_id_workspaces_id_fk" FOREIGN KEY ("active_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_health_snapshots" ADD CONSTRAINT "client_health_snapshots_client_id_client_accounts_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_captions" ADD CONSTRAINT "content_captions_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_project_id_content_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."content_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_schedule" ADD CONSTRAINT "content_schedule_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_schedule" ADD CONSTRAINT "content_schedule_caption_id_content_captions_id_fk" FOREIGN KEY ("caption_id") REFERENCES "public"."content_captions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csm_evals" ADD CONSTRAINT "csm_evals_client_id_client_accounts_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_evals" ADD CONSTRAINT "job_evals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_measurements" ADD CONSTRAINT "kpi_measurements_kpi_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_alerts" ADD CONSTRAINT "monitor_alerts_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_workspace" ADD CONSTRAINT "user_workspace_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_workspace" ADD CONSTRAINT "user_workspace_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_sessions" ADD CONSTRAINT "worker_sessions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_active_employees_employee_id" ON "active_employees" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_activity_type" ON "activity_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_activity_actor" ON "activity_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_activity_target" ON "activity_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_activity_created" ON "activity_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_approvals_status" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_approvals_status_priority" ON "approvals" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_auth_session_user" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_user_email" ON "auth_user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_channel_links_conversation" ON "channel_links" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_channel_links_channel" ON "channel_links" USING btree ("channel","channel_id");--> statement-breakpoint
CREATE INDEX "idx_client_accounts_status" ON "client_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_client_accounts_slug" ON "client_accounts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_client_accounts_health" ON "client_accounts" USING btree ("health_status");--> statement-breakpoint
CREATE INDEX "idx_client_health_client" ON "client_health_snapshots" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_health_checked" ON "client_health_snapshots" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "idx_content_captions_item" ON "content_captions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_content_items_project" ON "content_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_content_schedule_status" ON "content_schedule" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_workspace" ON "conversations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_cost_job" ON "cost_entries" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_cost_conv" ON "cost_entries" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_cost_date" ON "cost_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_cost_entries_model" ON "cost_entries" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_csm_evals_client" ON "csm_evals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_csm_evals_date" ON "csm_evals" USING btree ("eval_date");--> statement-breakpoint
CREATE INDEX "idx_priorities_date" ON "daily_priorities" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_document_chunks_document_id" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_employees_active" ON "employees" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_employees_pillar" ON "employees" USING btree ("pillar");--> statement-breakpoint
CREATE INDEX "idx_evolution_type" ON "evolution_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_evolution_date" ON "evolution_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_handoffs_to" ON "handoffs" USING btree ("to_employee","status");--> statement-breakpoint
CREATE INDEX "idx_handoffs_status" ON "handoffs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_improvement_status" ON "improvement_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_job_evals_job" ON "job_evals" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_job_evals_status" ON "job_evals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_job_evals_language" ON "job_evals" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_job_evals_model" ON "job_evals" USING btree ("agent_model");--> statement-breakpoint
CREATE INDEX "idx_job_evals_evaluated" ON "job_evals" USING btree ("evaluated_at");--> statement-breakpoint
CREATE INDEX "idx_job_logs_job" ON "job_logs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jobs_status_created" ON "jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_workspace" ON "jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_kpi_employee" ON "kpi_definitions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_kpi_meas_kpi" ON "kpi_measurements" USING btree ("kpi_id");--> statement-breakpoint
CREATE INDEX "idx_kpi_meas_employee" ON "kpi_measurements" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_kpi_meas_time" ON "kpi_measurements" USING btree ("measured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_lead_engagement_unique" ON "lead_engagement" USING btree ("account_id","contact_id");--> statement-breakpoint
CREATE INDEX "idx_lead_engagement_account" ON "lead_engagement" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_lead_engagement_status" ON "lead_engagement" USING btree ("engagement_status");--> statement-breakpoint
CREATE INDEX "idx_lead_engagement_responded" ON "lead_engagement" USING btree ("is_responded");--> statement-breakpoint
CREATE INDEX "idx_lead_events_account" ON "lead_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_lead_events_contact" ON "lead_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_lead_events_type" ON "lead_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_lead_events_created" ON "lead_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_lead_events_direction" ON "lead_events" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "idx_memories_type" ON "memories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_memories_source" ON "memories" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_memories_workspace" ON "memories" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conv" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_alerts_monitor" ON "monitor_alerts" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "idx_alerts_severity" ON "monitor_alerts" USING btree ("severity","acknowledged");--> statement-breakpoint
CREATE INDEX "idx_monitors_enabled" ON "monitors" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_notifications_read" ON "notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "idx_notifications_workspace" ON "notifications" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_routines_employee" ON "routines" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_routines_next" ON "routines" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "idx_scorecard_employee" ON "scorecard_entries" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_scorecard_metric" ON "scorecard_entries" USING btree ("employee_id","metric_id");--> statement-breakpoint
CREATE INDEX "idx_scorecard_employee_recorded" ON "scorecard_entries" USING btree ("employee_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_skills_usage" ON "skills" USING btree ("total_uses","success_rate");--> statement-breakpoint
CREATE INDEX "idx_skills_workspace" ON "skills" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_streaks_employee" ON "streaks" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_tool_calls_conv" ON "tool_calls" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_tool_calls_name" ON "tool_calls" USING btree ("tool_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_workspace_unique" ON "user_workspace" USING btree ("user_id","workspace_id");--> statement-breakpoint
CREATE INDEX "idx_user_workspace_user" ON "user_workspace" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_workspace_workspace" ON "user_workspace" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_worker_sessions_status" ON "worker_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_worker_sessions_runtime" ON "worker_sessions" USING btree ("runtime");--> statement-breakpoint
CREATE INDEX "idx_worker_sessions_updated" ON "worker_sessions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_worker_sessions_job_id" ON "worker_sessions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_status" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workspaces_owner" ON "workspaces" USING btree ("owner_chat_id");--> statement-breakpoint
CREATE INDEX "idx_workspaces_status" ON "workspaces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workspaces_repo" ON "workspaces" USING btree ("repo_url");--> statement-breakpoint
CREATE INDEX "idx_xp_events_action" ON "xp_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_xp_events_date" ON "xp_events" USING btree ("created_at");