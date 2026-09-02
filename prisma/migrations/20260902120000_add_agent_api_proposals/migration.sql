-- API keys are stored as one-way hashes. Agent changes remain proposals until
-- the owning user approves them in the application.
CREATE TABLE `AgentApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `keyPrefix` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AgentApiKey_tokenHash_key`(`tokenHash`),
    INDEX `AgentApiKey_userId_idx`(`userId`),
    INDEX `AgentApiKey_revokedAt_idx`(`revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgentProposal` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `apiKeyId` VARCHAR(191) NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `operations` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `result` JSON NULL,
    `error` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentProposal_userId_status_idx`(`userId`, `status`),
    INDEX `AgentProposal_workspaceId_idx`(`workspaceId`),
    INDEX `AgentProposal_apiKeyId_idx`(`apiKeyId`),
    INDEX `AgentProposal_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AgentApiKey` ADD CONSTRAINT `AgentApiKey_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AgentProposal` ADD CONSTRAINT `AgentProposal_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AgentProposal` ADD CONSTRAINT `AgentProposal_apiKeyId_fkey`
    FOREIGN KEY (`apiKeyId`) REFERENCES `AgentApiKey`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AgentProposal` ADD CONSTRAINT `AgentProposal_workspaceId_fkey`
    FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
