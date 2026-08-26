ALTER TABLE `Project` ADD COLUMN `parentId` VARCHAR(191) NULL;
ALTER TABLE `Task` ADD COLUMN `parentId` VARCHAR(191) NULL;

CREATE INDEX `Project_parentId_idx` ON `Project`(`parentId`);
CREATE INDEX `Task_parentId_idx` ON `Task`(`parentId`);

ALTER TABLE `Project`
  ADD CONSTRAINT `Project_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Task`
  ADD CONSTRAINT `Task_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `Task`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
