-- CreateTable
CREATE TABLE `TaskMedia` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `path` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(191) NULL,
    `originalName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskMedia_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TaskMedia` ADD CONSTRAINT `TaskMedia_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
