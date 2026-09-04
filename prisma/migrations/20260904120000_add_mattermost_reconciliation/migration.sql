ALTER TABLE `MattermostSyncControl`
    ADD COLUMN `lastReconciledAt` DATETIME(3) NULL,
    ADD COLUMN `lastReconcileSummary` JSON NULL;
