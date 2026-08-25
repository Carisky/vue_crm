-- AlterTable
ALTER TABLE `Conversation`
    ADD COLUMN `type` ENUM('DIRECT', 'WORKSPACE', 'GROUP') NOT NULL DEFAULT 'DIRECT',
    ADD COLUMN `name` VARCHAR(191) NULL,
    ADD COLUMN `channelKey` VARCHAR(191) NULL,
    ADD COLUMN `groupId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Task` ADD COLUMN `assigneeGroupId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `WorkspaceGroup` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `color` VARCHAR(191) NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkspaceGroup_workspaceId_name_key`(`workspaceId`, `name`),
    INDEX `WorkspaceGroup_workspaceId_idx`(`workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkspaceGroupMember` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WorkspaceGroupMember_groupId_userId_key`(`groupId`, `userId`),
    INDEX `WorkspaceGroupMember_userId_idx`(`userId`),
    INDEX `WorkspaceGroupMember_groupId_idx`(`groupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Conversation_workspaceId_channelKey_key` ON `Conversation`(`workspaceId`, `channelKey`);
CREATE UNIQUE INDEX `Conversation_groupId_key` ON `Conversation`(`groupId`);
CREATE INDEX `Task_assigneeGroupId_idx` ON `Task`(`assigneeGroupId`);

-- Backfill one general channel for every existing workspace.
INSERT INTO `Conversation` (`id`, `workspaceId`, `type`, `name`, `channelKey`, `createdAt`, `updatedAt`)
SELECT CONCAT('wschat_', REPLACE(UUID(), '-', '')), `id`, 'WORKSPACE', 'General', 'workspace', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `Workspace`;

-- Every current workspace member starts as a participant of its general channel.
INSERT INTO `ConversationParticipant` (`id`, `conversationId`, `userId`, `lastReadAt`, `createdAt`, `updatedAt`)
SELECT CONCAT('wscp_', REPLACE(UUID(), '-', '')), c.`id`, m.`userId`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `Member` m
INNER JOIN `Conversation` c
  ON c.`workspaceId` = m.`workspaceId`
 AND c.`type` = 'WORKSPACE'
 AND c.`channelKey` = 'workspace';

-- AddForeignKey
ALTER TABLE `WorkspaceGroup` ADD CONSTRAINT `WorkspaceGroup_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkspaceGroupMember` ADD CONSTRAINT `WorkspaceGroupMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `WorkspaceGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkspaceGroupMember` ADD CONSTRAINT `WorkspaceGroupMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Task` ADD CONSTRAINT `Task_assigneeGroupId_fkey` FOREIGN KEY (`assigneeGroupId`) REFERENCES `WorkspaceGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `WorkspaceGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
