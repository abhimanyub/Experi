CREATE TABLE `confounders` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`note` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`hypothesis` text NOT NULL,
	`archetype` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`verdict_id` text,
	`baseline_skipped` integer DEFAULT false NOT NULL,
	`abandon_reason` text
);
--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`schedule` text NOT NULL,
	`direction` text NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`metric_id` text NOT NULL,
	`phase_id` text NOT NULL,
	`value` real NOT NULL,
	`note` text,
	`observed_at` integer NOT NULL,
	`backfilled` integer DEFAULT false NOT NULL,
	`flagged` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`metric_id`) REFERENCES `metrics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `phases` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`sequence` integer NOT NULL,
	`planned_days` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `verdicts` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`outcome` text NOT NULL,
	`conclusion` text NOT NULL,
	`will_adopt` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE cascade
);
