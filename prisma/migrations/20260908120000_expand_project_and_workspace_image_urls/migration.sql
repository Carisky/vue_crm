-- Image uploads are stored as base64 data URLs. A valid 1 MB upload can exceed
-- the 64 KiB capacity of TEXT after base64 encoding, so keep the database
-- column capacity aligned with the upload limit.
ALTER TABLE `Workspace` MODIFY `imageUrl` MEDIUMTEXT NULL;
ALTER TABLE `Project` MODIFY `imageUrl` MEDIUMTEXT NULL;
