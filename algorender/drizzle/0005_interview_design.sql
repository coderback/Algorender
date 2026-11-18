ALTER TABLE "interview_round" ALTER COLUMN "language" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_round" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "interview_round" ADD COLUMN "estimates" jsonb;--> statement-breakpoint
ALTER TABLE "interview_round" ADD COLUMN "design" jsonb;