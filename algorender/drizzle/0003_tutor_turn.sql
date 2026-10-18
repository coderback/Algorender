CREATE TABLE "tutor_turn" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item" text NOT NULL,
	"action" text NOT NULL,
	"level" integer NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"leak_blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutor_turn" ADD CONSTRAINT "tutor_turn_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_turn_user_created_idx" ON "tutor_turn" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tutor_turn_created_idx" ON "tutor_turn" USING btree ("created_at");