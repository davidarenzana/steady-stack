CREATE TABLE `contribution_override` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` text NOT NULL,
	`month` text NOT NULL,
	`amount` integer,
	`timing` text,
	`note` text,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolio`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_override_month_unique` ON `contribution_override` (`portfolio_id`,`month`);--> statement-breakpoint
CREATE TABLE `contribution_rule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` text NOT NULL,
	`from_month` text NOT NULL,
	`amount` integer NOT NULL,
	`timing` text DEFAULT 'start' NOT NULL,
	`weights` text NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolio`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_rule_month_unique` ON `contribution_rule` (`portfolio_id`,`from_month`);--> statement-breakpoint
CREATE TABLE `fund` (
	`id` text PRIMARY KEY NOT NULL,
	`isin` text NOT NULL,
	`name` text NOT NULL,
	`provider_symbol` text,
	`currency` text DEFAULT 'EUR' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fund_isin_unique` ON `fund` (`isin`);--> statement-breakpoint
CREATE TABLE `nav` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fund_id` text NOT NULL,
	`date` text NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`fund_id`) REFERENCES `fund`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nav_fund_date_unique` ON `nav` (`fund_id`,`date`);--> statement-breakpoint
CREATE TABLE `portfolio` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`horizon_years` integer DEFAULT 25 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` text NOT NULL,
	`fund_id` text NOT NULL,
	`month` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`nav` text NOT NULL,
	`units` text NOT NULL,
	`source` text DEFAULT 'auto' NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolio`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_id`) REFERENCES `fund`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_auto_month_unique` ON `purchase` (`portfolio_id`,`fund_id`,`month`) WHERE "purchase"."source" = 'auto';--> statement-breakpoint
CREATE TABLE `scenario` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`annual_rate` text NOT NULL,
	`color` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL
);
