-- Add startedAt column to Task table
ALTER TABLE `Task` ADD COLUMN `startedAt` DATETIME(3) NULL AFTER `dueDate`;

-- Add estimatedHours column to Task table
ALTER TABLE `Task` ADD COLUMN `estimatedHours` DOUBLE NULL AFTER `startedAt`;

-- Add actualHours column to Task table
ALTER TABLE `Task` ADD COLUMN `actualHours` DOUBLE NULL AFTER `estimatedHours`;
