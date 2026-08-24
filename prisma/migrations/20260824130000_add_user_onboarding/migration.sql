-- AlterTable
ALTER TABLE `User`
    ADD COLUMN `onboardingStatus` VARCHAR(191) NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN `onboardingVersion` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `onboardingUpdatedAt` DATETIME(3) NULL;
