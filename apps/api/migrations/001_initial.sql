CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" text NOT NULL,
	"recording" integer DEFAULT 0 NOT NULL,
	"transcription" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "workspace_invites" (
	"code" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"expires_at" text NOT NULL,
	"created_by" text NOT NULL,
	FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "workspace_members" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"joined_at" text NOT NULL,
	PRIMARY KEY("workspace_id", "user_id"),
	FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window" integer NOT NULL,
	"hits" integer NOT NULL
);

CREATE TABLE "audit" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"artifact_id" text NOT NULL,
	"at" text NOT NULL,
	FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"color" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"session_id" text,
	FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "conversation_kind" CHECK("conversations"."kind" IN ('public','private','group','direct','room'))
);

CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" text NOT NULL,
	"edited_at" text,
	"deleted_at" text,
	FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "room_canvases" (
	"session_id" text PRIMARY KEY NOT NULL,
	"nodes" text DEFAULT '[]' NOT NULL,
	"edges" text DEFAULT '[]' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "room_guests" (
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" text NOT NULL,
	PRIMARY KEY("session_id", "user_id"),
	FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "room_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"revoked_at" text,
	FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "canvases" (
	"project_id" text PRIMARY KEY NOT NULL,
	"nodes" text DEFAULT '[]' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"title" text NOT NULL,
	"owner" text NOT NULL,
	"due_at" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "conversation_members" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	PRIMARY KEY("conversation_id", "user_id"),
	FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX "workspaces_owner_id_unique" ON "workspaces" ("owner_id");

CREATE UNIQUE INDEX "conversations_session_id_unique" ON "conversations" ("session_id");

CREATE INDEX "messages_conversation_time" ON "messages" ("conversation_id","created_at");

ALTER TABLE "canvases" ADD "edges" text DEFAULT '[]' NOT NULL;

CREATE UNIQUE INDEX "room_invites_code_hash_unique" ON "room_invites" ("code_hash");
