CREATE TABLE "interview_round" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"format" text NOT NULL,
	"item" text NOT NULL,
	"language" text NOT NULL,
	"limit_min" integer NOT NULL,
	"phase" text NOT NULL,
	"phases" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"hints" integer DEFAULT 0 NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"transcript" jsonb NOT NULL,
	"approach" jsonb,
	"edge_cases" text,
	"code" text,
	"submissions" jsonb NOT NULL,
	"debrief" jsonb,
	"passed" boolean,
	"scored_by" text,
	"repeat" boolean DEFAULT false NOT NULL,
	"event_id" uuid,
	"cost_usd" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_round" ADD CONSTRAINT "interview_round_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_round_user_started_idx" ON "interview_round" USING btree ("user_id","started_at");