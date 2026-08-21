-- Stage private storage metadata while retaining legacy filesystem paths.
ALTER TABLE `TaskMedia`
  ADD COLUMN `workspaceId` VARCHAR(191) NULL,
  ADD COLUMN `uploadedById` VARCHAR(191) NULL,
  ADD COLUMN `storageKey` VARCHAR(191) NULL,
  ADD COLUMN `size` INT NOT NULL DEFAULT 0,
  MODIFY COLUMN `path` VARCHAR(191) NULL;

-- Existing media derives its owner from the task it belongs to.
UPDATE `TaskMedia` AS `media`
INNER JOIN `Task` AS `task` ON `task`.`id` = `media`.`taskId`
SET `media`.`workspaceId` = `task`.`workspaceId`
WHERE `media`.`workspaceId` IS NULL;

-- This fails rather than accepting an unresolved media row.
ALTER TABLE `TaskMedia`
  MODIFY COLUMN `workspaceId` VARCHAR(191) NOT NULL;

ALTER TABLE `TaskMediaVariant`
  ADD COLUMN `storageKey` VARCHAR(191) NULL,
  ADD COLUMN `size` INT NOT NULL DEFAULT 0,
  MODIFY COLUMN `path` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `TaskMedia_storageKey_key` ON `TaskMedia`(`storageKey`);
CREATE UNIQUE INDEX `TaskMediaVariant_storageKey_key` ON `TaskMediaVariant`(`storageKey`);
CREATE INDEX `TaskMedia_workspaceId_idx` ON `TaskMedia`(`workspaceId`);
CREATE INDEX `TaskMedia_uploadedById_idx` ON `TaskMedia`(`uploadedById`);
CREATE INDEX `TaskMedia_taskId_createdAt_idx` ON `TaskMedia`(`taskId`, `createdAt`);

ALTER TABLE `TaskMedia`
  ADD CONSTRAINT `TaskMedia_workspaceId_fkey`
    FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TaskMedia_uploadedById_fkey`
    FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
