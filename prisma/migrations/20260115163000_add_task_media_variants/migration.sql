-- AddColumn
ALTER TABLE `TaskMedia` ADD COLUMN `resolution` INT NULL;

-- CreateTable
CREATE TABLE `TaskMediaVariant` (
    `id` VARCHAR(191) NOT NULL,
    `taskMediaId` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(191) NULL,
    `resolution` INT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskMediaVariant_taskMediaId_idx`(`taskMediaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TaskMediaVariant` ADD CONSTRAINT `TaskMediaVariant_taskMediaId_fkey` FOREIGN KEY (`taskMediaId`) REFERENCES `TaskMedia`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
