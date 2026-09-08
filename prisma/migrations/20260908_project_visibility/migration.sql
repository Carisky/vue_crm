-- AlterTable
ALTER TABLE `Project`
    ADD COLUMN `creatorId` VARCHAR(191) NULL,
    ADD COLUMN `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PUBLIC';

-- Backfill existing projects to the current workspace owner.
UPDATE `Project` AS `project`
INNER JOIN `Workspace` AS `workspace` ON `workspace`.`id` = `project`.`workspaceId`
SET `project`.`creatorId` = `workspace`.`ownerId`;

ALTER TABLE `Project` MODIFY `creatorId` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `ProjectAccess` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectAccess_userId_idx`(`userId`),
    UNIQUE INDEX `ProjectAccess_projectId_userId_key`(`projectId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Project_creatorId_idx` ON `Project`(`creatorId`);

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAccess` ADD CONSTRAINT `ProjectAccess_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAccess` ADD CONSTRAINT `ProjectAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
