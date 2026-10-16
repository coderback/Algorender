CREATE TABLE "judge_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"problem" text NOT NULL,
	"language" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"tests" integer NOT NULL,
	"failed" integer,
	"seconds" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "judge_run" ADD CONSTRAINT "judge_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "judge_run_user_created_idx" ON "judge_run" USING btree ("user_id","created_at");