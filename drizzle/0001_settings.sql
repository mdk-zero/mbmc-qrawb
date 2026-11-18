CREATE TABLE IF NOT EXISTS `settings` (
	`setting_key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `settings_setting_key` PRIMARY KEY(`setting_key`)
);
