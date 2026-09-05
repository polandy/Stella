-- MariaDB dump 10.20-12.3.3-MariaDB, for debian-linux-gnu (x86_64)
-- A hand-written, minimal Monica 4.x dump for the import e2e: two people who are parent and
-- child, one deleted person, one note, one age-based birthday and one avatar photo.
CREATE TABLE `contacts` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `first_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) DEFAULT NULL,
  `is_partial` tinyint(1) NOT NULL DEFAULT 0,
  `is_dead` tinyint(1) NOT NULL DEFAULT 0,
  `birthday_special_date_id` int(10) unsigned DEFAULT NULL,
  `avatar_source` varchar(255) DEFAULT 'default',
  `avatar_photo_id` int(10) unsigned DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4;
INSERT INTO `contacts` VALUES
(1,'Ottilie','Vogelsang',0,0,1,'photo',1,NULL,'2023-06-14 22:24:24'),
(2,'Kaspar','Vogelsang',0,0,NULL,'default',NULL,NULL,'2023-06-14 22:25:00'),
(3,'Gone','Vogelsang',0,0,NULL,'default',NULL,'2024-01-01 00:00:00','2023-06-14 22:26:00');
CREATE TABLE `special_dates` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `contact_id` int(10) unsigned NOT NULL,
  `is_age_based` tinyint(1) NOT NULL DEFAULT 0,
  `is_year_unknown` tinyint(1) NOT NULL DEFAULT 0,
  `date` date DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4;
INSERT INTO `special_dates` VALUES
(1,1,1,0,'2016-06-14');
CREATE TABLE `relationship_types` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `name_reverse_relationship` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4;
INSERT INTO `relationship_types` VALUES
(8,'parent','child'),
(9,'child','parent');
CREATE TABLE `relationships` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `relationship_type_id` int(10) unsigned NOT NULL,
  `contact_is` int(10) unsigned NOT NULL,
  `of_contact` int(10) unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
INSERT INTO `relationships` VALUES
(1,8,1,2,'2023-06-14 22:30:00'),
(2,9,2,1,'2023-06-14 22:30:00');
CREATE TABLE `notes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `contact_id` int(10) unsigned NOT NULL,
  `body` text NOT NULL,
  `is_favorited` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4;
INSERT INTO `notes` VALUES
(1,1,'Prefers the harbour walk in Tallinn.',0,'2024-03-02 10:00:00');
CREATE TABLE `photos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `new_filename` varchar(255) NOT NULL,
  `mime_type` varchar(255) DEFAULT NULL,
  `filesize` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4;
INSERT INTO `photos` VALUES
(1,'photos/ottilie-avatar.png','image/png',68,'2024-03-02 10:05:00');
CREATE TABLE `contact_photo` (
  `contact_id` int(10) unsigned NOT NULL,
  `photo_id` int(10) unsigned NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `contact_photo` VALUES
(1,1);
