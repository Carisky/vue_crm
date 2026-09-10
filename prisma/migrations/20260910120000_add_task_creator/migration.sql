ALTER TABLE `Task` ADD COLUMN `creatorId` VARCHAR(191) NULL;

UPDATE `Task` AS `task`
SET `task`.`creatorId` = (
  SELECT `notification`.`actorId`
  FROM `Notification` AS `notification`
  WHERE `notification`.`taskId` = `task`.`id`
    AND `notification`.`type` = 'TASK_CREATED'
    AND `notification`.`actorId` IS NOT NULL
  ORDER BY `notification`.`createdAt` ASC, `notification`.`id` ASC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM `Notification` AS `notification`
  WHERE `notification`.`taskId` = `task`.`id`
    AND `notification`.`type` = 'TASK_CREATED'
    AND `notification`.`actorId` IS NOT NULL
);

UPDATE `Task` AS `task`
INNER JOIN `Workspace` AS `workspace` ON `workspace`.`id` = `task`.`workspaceId`
SET `task`.`creatorId` = `workspace`.`ownerId`
WHERE `task`.`creatorId` IS NULL;

ALTER TABLE `Task` MODIFY `creatorId` VARCHAR(191) NOT NULL;
CREATE INDEX `Task_creatorId_idx` ON `Task`(`creatorId`);
ALTER TABLE `Task`
  ADD CONSTRAINT `Task_creatorId_fkey`
  FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
