-- AlterTable
ALTER TABLE `ProjectDoc` ADD COLUMN `sectionId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ProjectDocSection` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectDocSection_workspaceId_idx`(`workspaceId`),
    INDEX `ProjectDocSection_projectId_idx`(`projectId`),
    INDEX `ProjectDocSection_authorId_idx`(`authorId`),
    INDEX `ProjectDocSection_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ProjectDoc_sectionId_idx` ON `ProjectDoc`(`sectionId`);

-- AddForeignKey
ALTER TABLE `ProjectDocSection` ADD CONSTRAINT `ProjectDocSection_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocSection` ADD CONSTRAINT `ProjectDocSection_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocSection` ADD CONSTRAINT `ProjectDocSection_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDoc` ADD CONSTRAINT `ProjectDoc_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `ProjectDocSection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

