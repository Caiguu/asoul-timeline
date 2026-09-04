CREATE TABLE `accounts` (
	`uid` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dynamics` (
	`id` text PRIMARY KEY NOT NULL,
	`uid` integer NOT NULL,
	`type` text NOT NULL,
	`bili_type` text NOT NULL,
	`text` text NOT NULL,
	`rich_text` text NOT NULL,
	`raw` text NOT NULL,
	`images` text NOT NULL,
	`author_name` text NOT NULL,
	`author_face` text,
	`author_url` text,
	`dynamic_url` text NOT NULL,
	`video_cover` text,
	`video_title` text,
	`forward` text,
	`reserve` text,
	`schedule_entries` text,
	`live_time` integer,
	`live_title` text,
	`created_at` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`uid`) REFERENCES `accounts`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dynamic_id` text NOT NULL,
	`uid` integer NOT NULL,
	`rid` integer NOT NULL,
	`title` text NOT NULL,
	`live_time` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`live_type` text,
	`participants` text,
	`live_room_url` text,
	`source` text,
	FOREIGN KEY (`dynamic_id`) REFERENCES `dynamics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_schedules_rid_unique` ON `live_schedules` (`rid`);