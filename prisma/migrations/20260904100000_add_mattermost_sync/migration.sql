-- Mattermost identifiers are stored separately from CRM domain records. CRM
-- remains the source of truth and the outbox is the only durable outbound path.
CREATE TABLE `MattermostUserLink` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `mattermostUserId` VARCHAR(191) NULL,
    `username` VARCHAR(191) NOT NULL,
    `syncState` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `lastError` TEXT NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MattermostUserLink_userId_key`(`userId`),
    UNIQUE INDEX `MattermostUserLink_mattermostUserId_key`(`mattermostUserId`),
    UNIQUE INDEX `MattermostUserLink_username_key`(`username`),
    INDEX `MattermostUserLink_syncState_idx`(`syncState`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MattermostWorkspaceLink` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `mattermostTeamId` VARCHAR(191) NOT NULL,
    `teamName` VARCHAR(191) NOT NULL,
    `syncState` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `lastError` TEXT NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MattermostWorkspaceLink_workspaceId_key`(`workspaceId`),
    UNIQUE INDEX `MattermostWorkspaceLink_mattermostTeamId_key`(`mattermostTeamId`),
    UNIQUE INDEX `MattermostWorkspaceLink_teamName_key`(`teamName`),
    INDEX `MattermostWorkspaceLink_syncState_idx`(`syncState`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MattermostConversationLink` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `mattermostChannelId` VARCHAR(191) NOT NULL,
    `channelName` VARCHAR(191) NOT NULL,
    `syncState` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `lastError` TEXT NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MattermostConversationLink_conversationId_key`(`conversationId`),
    UNIQUE INDEX `MattermostConversationLink_mattermostChannelId_key`(`mattermostChannelId`),
    UNIQUE INDEX `MattermostConversationLink_channelName_key`(`channelName`),
    INDEX `MattermostConversationLink_syncState_idx`(`syncState`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MattermostMessageLink` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `mattermostPostId` VARCHAR(191) NOT NULL,
    `origin` ENUM('CRM', 'MATTERMOST', 'BOOTSTRAP') NOT NULL,
    `syncState` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'SYNCED',
    `lastError` TEXT NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MattermostMessageLink_messageId_key`(`messageId`),
    UNIQUE INDEX `MattermostMessageLink_mattermostPostId_key`(`mattermostPostId`),
    INDEX `MattermostMessageLink_syncState_idx`(`syncState`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MattermostWebhookNonce` (
    `nonce` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MattermostWebhookNonce_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`nonce`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MattermostInboundEvent` (
    `eventId` VARCHAR(191) NOT NULL,
    `mattermostPostId` VARCHAR(191) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    UNIQUE INDEX `MattermostInboundEvent_mattermostPostId_key`(`mattermostPostId`),
    PRIMARY KEY (`eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MattermostOutboxEvent` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(64) NOT NULL,
    `aggregateType` VARCHAR(64) NOT NULL,
    `aggregateId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `state` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lockedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MattermostOutboxEvent_idempotencyKey_key`(`idempotencyKey`),
    INDEX `MattermostOutboxEvent_state_nextAttemptAt_idx`(`state`, `nextAttemptAt`),
    INDEX `MattermostOutboxEvent_aggregateType_aggregateId_createdAt_idx`(`aggregateType`, `aggregateId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MattermostSyncControl` (
    `key` VARCHAR(191) NOT NULL DEFAULT 'global',
    `pausedAt` DATETIME(3) NULL,
    `pauseReason` VARCHAR(191) NULL,
    `snapshotCutoff` DATETIME(3) NULL,
    `lastBootstrapAt` DATETIME(3) NULL,
    `lastBootstrapState` VARCHAR(32) NULL,
    `lastBootstrapSummary` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MattermostUserLink` ADD CONSTRAINT `MattermostUserLink_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MattermostWorkspaceLink` ADD CONSTRAINT `MattermostWorkspaceLink_workspaceId_fkey`
    FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MattermostConversationLink` ADD CONSTRAINT `MattermostConversationLink_conversationId_fkey`
    FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MattermostMessageLink` ADD CONSTRAINT `MattermostMessageLink_messageId_fkey`
    FOREIGN KEY (`messageId`) REFERENCES `ConversationMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `MattermostSyncControl` (
    `key`,
    `pausedAt`,
    `pauseReason`,
    `snapshotCutoff`,
    `lastBootstrapAt`,
    `lastBootstrapState`,
    `lastBootstrapSummary`,
    `updatedAt`
) VALUES (
    'global', NULL, NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP(3)
) ON DUPLICATE KEY UPDATE `key` = VALUES(`key`);
