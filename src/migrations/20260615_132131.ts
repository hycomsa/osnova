import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_global_roles" AS ENUM('system_admin');
  CREATE TYPE "public"."enum_users_locale" AS ENUM('pl', 'en', 'de');
  CREATE TYPE "public"."enum_users_email_digest" AS ENUM('none', 'daily', 'weekly');
  CREATE TYPE "public"."enum_workspaces_default_view" AS ENUM('direct', 'client_business', 'client_technical');
  CREATE TYPE "public"."enum_memberships_roles" AS ENUM('workspace_maintainer', 'editor', 'client_technical', 'client_business', 'viewer');
  CREATE TYPE "public"."enum_memberships_granted_permissions" AS ENUM('read', 'comment', 'approve', 'edit-wysiwyg', 'edit-raw', 'page-create', 'page-delete', 'page-rename', 'page-duplicate', 'props-view', 'props-edit', 'history-view', 'reports-view', 'ai-use');
  CREATE TYPE "public"."enum_memberships_revoked_permissions" AS ENUM('read', 'comment', 'approve', 'edit-wysiwyg', 'edit-raw', 'page-create', 'page-delete', 'page-rename', 'page-duplicate', 'props-view', 'props-edit', 'history-view', 'reports-view', 'ai-use');
  CREATE TYPE "public"."enum_memberships_view_access" AS ENUM('direct', 'client_business', 'client_technical');
  CREATE TYPE "public"."enum_repo_bindings_host" AS ENUM('gitlab', 'github');
  CREATE TYPE "public"."enum_view_configs_view" AS ENUM('direct', 'client_business', 'client_technical');
  CREATE TYPE "public"."enum_view_configs_source" AS ENUM('hybrid', 'docsconfig', 'osnova');
  CREATE TYPE "public"."enum_comments_kind" AS ENUM('inline', 'document');
  CREATE TYPE "public"."enum_comments_status" AS ENUM('open', 'resolved');
  CREATE TYPE "public"."enum_approvals_status" AS ENUM('in_review', 'approved', 'rejected', 'changes_requested');
  CREATE TYPE "public"."enum_notifications_type" AS ENUM('mention', 'reply', 'approval', 'approval_approved', 'approval_changes');
  CREATE TYPE "public"."enum_audit_log_action" AS ENUM('access-denied', 'document-opened', 'commit-pushed', 'comment-created', 'file-created', 'file-deleted', 'file-renamed', 'file-duplicated', 'file-restored', 'properties-changed');
  CREATE TYPE "public"."enum_ai_skills_category" AS ENUM('apply', 'refine');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'clone-workspace-repo');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'clone-workspace-repo');
  CREATE TABLE "users_global_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_global_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"keycloak_sub" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"name" varchar,
  	"locale" "enum_users_locale",
  	"email_digest" "enum_users_email_digest" DEFAULT 'daily',
  	"last_digest_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "workspaces" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"default_view" "enum_workspaces_default_view" DEFAULT 'client_business' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "memberships_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_memberships_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "memberships_granted_permissions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_memberships_granted_permissions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "memberships_revoked_permissions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_memberships_revoked_permissions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "memberships_view_access" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_memberships_view_access",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "memberships" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "repo_bindings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" integer NOT NULL,
  	"host" "enum_repo_bindings_host" NOT NULL,
  	"repo_url" varchar NOT NULL,
  	"branch" varchar DEFAULT 'main' NOT NULL,
  	"credential_ref" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "view_configs_include_globs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"glob" varchar NOT NULL
  );
  
  CREATE TABLE "view_configs_exclude_globs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"glob" varchar NOT NULL
  );
  
  CREATE TABLE "view_configs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" integer NOT NULL,
  	"view" "enum_view_configs_view" NOT NULL,
  	"hide_underscored" boolean DEFAULT true,
  	"show_metadata" boolean DEFAULT false,
  	"source" "enum_view_configs_source" DEFAULT 'hybrid' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "comments_reactions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"emoji" varchar NOT NULL,
  	"author_sub" varchar NOT NULL
  );
  
  CREATE TABLE "comments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"kind" "enum_comments_kind" DEFAULT 'document' NOT NULL,
  	"quote" varchar,
  	"prefix" varchar,
  	"suffix" varchar,
  	"context_hash" varchar,
  	"revision" varchar,
  	"body" varchar NOT NULL,
  	"parent_id" integer,
  	"status" "enum_comments_status" DEFAULT 'open' NOT NULL,
  	"accepted" boolean DEFAULT false,
  	"author_sub" varchar NOT NULL,
  	"author_name" varchar,
  	"author_email" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "approvals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"revision" varchar,
  	"status" "enum_approvals_status" NOT NULL,
  	"note" varchar,
  	"author_sub" varchar NOT NULL,
  	"author_name" varchar,
  	"author_email" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"recipient_id" integer NOT NULL,
  	"type" "enum_notifications_type" DEFAULT 'mention' NOT NULL,
  	"workspace_id" integer,
  	"view" varchar,
  	"path" varchar,
  	"comment_id" varchar,
  	"actor_name" varchar,
  	"actor_email" varchar,
  	"excerpt" varchar,
  	"read" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "favorites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"workspace_id" integer NOT NULL,
  	"view" varchar,
  	"path" varchar NOT NULL,
  	"label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"action" "enum_audit_log_action" NOT NULL,
  	"workspace_id" integer,
  	"user_id" varchar,
  	"user_email" varchar,
  	"view" varchar,
  	"path" varchar,
  	"detail" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_skills" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" integer,
  	"key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"category" "enum_ai_skills_category" DEFAULT 'apply' NOT NULL,
  	"instruction" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"builtin" boolean DEFAULT false,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"workspaces_id" integer,
  	"memberships_id" integer,
  	"repo_bindings_id" integer,
  	"view_configs_id" integer,
  	"comments_id" integer,
  	"approvals_id" integer,
  	"notifications_id" integer,
  	"favorites_id" integer,
  	"audit_log_id" integer,
  	"ai_skills_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_global_roles" ADD CONSTRAINT "users_global_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "memberships_roles" ADD CONSTRAINT "memberships_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "memberships_granted_permissions" ADD CONSTRAINT "memberships_granted_permissions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "memberships_revoked_permissions" ADD CONSTRAINT "memberships_revoked_permissions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "memberships_view_access" ADD CONSTRAINT "memberships_view_access_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "repo_bindings" ADD CONSTRAINT "repo_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "view_configs_include_globs" ADD CONSTRAINT "view_configs_include_globs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."view_configs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "view_configs_exclude_globs" ADD CONSTRAINT "view_configs_exclude_globs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."view_configs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "view_configs" ADD CONSTRAINT "view_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments_reactions" ADD CONSTRAINT "comments_reactions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "favorites" ADD CONSTRAINT "favorites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_skills" ADD CONSTRAINT "ai_skills_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_workspaces_fk" FOREIGN KEY ("workspaces_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_memberships_fk" FOREIGN KEY ("memberships_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_repo_bindings_fk" FOREIGN KEY ("repo_bindings_id") REFERENCES "public"."repo_bindings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_view_configs_fk" FOREIGN KEY ("view_configs_id") REFERENCES "public"."view_configs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comments_fk" FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_approvals_fk" FOREIGN KEY ("approvals_id") REFERENCES "public"."approvals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_favorites_fk" FOREIGN KEY ("favorites_id") REFERENCES "public"."favorites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_skills_fk" FOREIGN KEY ("ai_skills_id") REFERENCES "public"."ai_skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_global_roles_order_idx" ON "users_global_roles" USING btree ("order");
  CREATE INDEX "users_global_roles_parent_idx" ON "users_global_roles" USING btree ("parent_id");
  CREATE UNIQUE INDEX "users_keycloak_sub_idx" ON "users" USING btree ("keycloak_sub");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "workspaces_slug_idx" ON "workspaces" USING btree ("slug");
  CREATE INDEX "workspaces_updated_at_idx" ON "workspaces" USING btree ("updated_at");
  CREATE INDEX "workspaces_created_at_idx" ON "workspaces" USING btree ("created_at");
  CREATE INDEX "memberships_roles_order_idx" ON "memberships_roles" USING btree ("order");
  CREATE INDEX "memberships_roles_parent_idx" ON "memberships_roles" USING btree ("parent_id");
  CREATE INDEX "memberships_granted_permissions_order_idx" ON "memberships_granted_permissions" USING btree ("order");
  CREATE INDEX "memberships_granted_permissions_parent_idx" ON "memberships_granted_permissions" USING btree ("parent_id");
  CREATE INDEX "memberships_revoked_permissions_order_idx" ON "memberships_revoked_permissions" USING btree ("order");
  CREATE INDEX "memberships_revoked_permissions_parent_idx" ON "memberships_revoked_permissions" USING btree ("parent_id");
  CREATE INDEX "memberships_view_access_order_idx" ON "memberships_view_access" USING btree ("order");
  CREATE INDEX "memberships_view_access_parent_idx" ON "memberships_view_access" USING btree ("parent_id");
  CREATE INDEX "memberships_workspace_idx" ON "memberships" USING btree ("workspace_id");
  CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");
  CREATE INDEX "memberships_updated_at_idx" ON "memberships" USING btree ("updated_at");
  CREATE INDEX "memberships_created_at_idx" ON "memberships" USING btree ("created_at");
  CREATE UNIQUE INDEX "workspace_user_idx" ON "memberships" USING btree ("workspace_id","user_id");
  CREATE INDEX "repo_bindings_workspace_idx" ON "repo_bindings" USING btree ("workspace_id");
  CREATE INDEX "repo_bindings_updated_at_idx" ON "repo_bindings" USING btree ("updated_at");
  CREATE INDEX "repo_bindings_created_at_idx" ON "repo_bindings" USING btree ("created_at");
  CREATE INDEX "view_configs_include_globs_order_idx" ON "view_configs_include_globs" USING btree ("_order");
  CREATE INDEX "view_configs_include_globs_parent_id_idx" ON "view_configs_include_globs" USING btree ("_parent_id");
  CREATE INDEX "view_configs_exclude_globs_order_idx" ON "view_configs_exclude_globs" USING btree ("_order");
  CREATE INDEX "view_configs_exclude_globs_parent_id_idx" ON "view_configs_exclude_globs" USING btree ("_parent_id");
  CREATE INDEX "view_configs_workspace_idx" ON "view_configs" USING btree ("workspace_id");
  CREATE INDEX "view_configs_updated_at_idx" ON "view_configs" USING btree ("updated_at");
  CREATE INDEX "view_configs_created_at_idx" ON "view_configs" USING btree ("created_at");
  CREATE INDEX "comments_reactions_order_idx" ON "comments_reactions" USING btree ("_order");
  CREATE INDEX "comments_reactions_parent_id_idx" ON "comments_reactions" USING btree ("_parent_id");
  CREATE INDEX "comments_workspace_idx" ON "comments" USING btree ("workspace_id");
  CREATE INDEX "comments_path_idx" ON "comments" USING btree ("path");
  CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");
  CREATE INDEX "comments_author_sub_idx" ON "comments" USING btree ("author_sub");
  CREATE INDEX "comments_updated_at_idx" ON "comments" USING btree ("updated_at");
  CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");
  CREATE INDEX "approvals_workspace_idx" ON "approvals" USING btree ("workspace_id");
  CREATE INDEX "approvals_path_idx" ON "approvals" USING btree ("path");
  CREATE INDEX "approvals_author_sub_idx" ON "approvals" USING btree ("author_sub");
  CREATE INDEX "approvals_updated_at_idx" ON "approvals" USING btree ("updated_at");
  CREATE INDEX "approvals_created_at_idx" ON "approvals" USING btree ("created_at");
  CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id");
  CREATE INDEX "notifications_workspace_idx" ON "notifications" USING btree ("workspace_id");
  CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("read");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE INDEX "favorites_user_idx" ON "favorites" USING btree ("user_id");
  CREATE INDEX "favorites_workspace_idx" ON "favorites" USING btree ("workspace_id");
  CREATE INDEX "favorites_updated_at_idx" ON "favorites" USING btree ("updated_at");
  CREATE INDEX "favorites_created_at_idx" ON "favorites" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_workspace_path_idx" ON "favorites" USING btree ("user_id","workspace_id","path");
  CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");
  CREATE INDEX "audit_log_workspace_idx" ON "audit_log" USING btree ("workspace_id");
  CREATE INDEX "audit_log_user_id_idx" ON "audit_log" USING btree ("user_id");
  CREATE INDEX "audit_log_updated_at_idx" ON "audit_log" USING btree ("updated_at");
  CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
  CREATE INDEX "workspace_action_idx" ON "audit_log" USING btree ("workspace_id","action");
  CREATE INDEX "userId_idx" ON "audit_log" USING btree ("user_id");
  CREATE INDEX "ai_skills_workspace_idx" ON "ai_skills" USING btree ("workspace_id");
  CREATE INDEX "ai_skills_key_idx" ON "ai_skills" USING btree ("key");
  CREATE INDEX "ai_skills_updated_at_idx" ON "ai_skills" USING btree ("updated_at");
  CREATE INDEX "ai_skills_created_at_idx" ON "ai_skills" USING btree ("created_at");
  CREATE INDEX "workspace_idx" ON "ai_skills" USING btree ("workspace_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_workspaces_id_idx" ON "payload_locked_documents_rels" USING btree ("workspaces_id");
  CREATE INDEX "payload_locked_documents_rels_memberships_id_idx" ON "payload_locked_documents_rels" USING btree ("memberships_id");
  CREATE INDEX "payload_locked_documents_rels_repo_bindings_id_idx" ON "payload_locked_documents_rels" USING btree ("repo_bindings_id");
  CREATE INDEX "payload_locked_documents_rels_view_configs_id_idx" ON "payload_locked_documents_rels" USING btree ("view_configs_id");
  CREATE INDEX "payload_locked_documents_rels_comments_id_idx" ON "payload_locked_documents_rels" USING btree ("comments_id");
  CREATE INDEX "payload_locked_documents_rels_approvals_id_idx" ON "payload_locked_documents_rels" USING btree ("approvals_id");
  CREATE INDEX "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");
  CREATE INDEX "payload_locked_documents_rels_favorites_id_idx" ON "payload_locked_documents_rels" USING btree ("favorites_id");
  CREATE INDEX "payload_locked_documents_rels_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_log_id");
  CREATE INDEX "payload_locked_documents_rels_ai_skills_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_skills_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_global_roles" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "workspaces" CASCADE;
  DROP TABLE "memberships_roles" CASCADE;
  DROP TABLE "memberships_granted_permissions" CASCADE;
  DROP TABLE "memberships_revoked_permissions" CASCADE;
  DROP TABLE "memberships_view_access" CASCADE;
  DROP TABLE "memberships" CASCADE;
  DROP TABLE "repo_bindings" CASCADE;
  DROP TABLE "view_configs_include_globs" CASCADE;
  DROP TABLE "view_configs_exclude_globs" CASCADE;
  DROP TABLE "view_configs" CASCADE;
  DROP TABLE "comments_reactions" CASCADE;
  DROP TABLE "comments" CASCADE;
  DROP TABLE "approvals" CASCADE;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "favorites" CASCADE;
  DROP TABLE "audit_log" CASCADE;
  DROP TABLE "ai_skills" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_global_roles";
  DROP TYPE "public"."enum_users_locale";
  DROP TYPE "public"."enum_users_email_digest";
  DROP TYPE "public"."enum_workspaces_default_view";
  DROP TYPE "public"."enum_memberships_roles";
  DROP TYPE "public"."enum_memberships_granted_permissions";
  DROP TYPE "public"."enum_memberships_revoked_permissions";
  DROP TYPE "public"."enum_memberships_view_access";
  DROP TYPE "public"."enum_repo_bindings_host";
  DROP TYPE "public"."enum_view_configs_view";
  DROP TYPE "public"."enum_view_configs_source";
  DROP TYPE "public"."enum_comments_kind";
  DROP TYPE "public"."enum_comments_status";
  DROP TYPE "public"."enum_approvals_status";
  DROP TYPE "public"."enum_notifications_type";
  DROP TYPE "public"."enum_audit_log_action";
  DROP TYPE "public"."enum_ai_skills_category";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
