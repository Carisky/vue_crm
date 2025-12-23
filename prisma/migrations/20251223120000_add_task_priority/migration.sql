-- Add TaskPriority enum and priority column
ALTER TABLE `Task`
  ADD COLUMN `priority` ENUM('VERY_LOW','LOW','MEDIUM','HIGH','REAL_TIME','HIGH_REAL_TIME') NOT NULL DEFAULT 'MEDIUM' AFTER `status`;
