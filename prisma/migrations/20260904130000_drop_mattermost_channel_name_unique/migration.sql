-- `town-square` is the default channel name in every Mattermost team. Channel
-- names are therefore only unique within a team, while Mattermost channel IDs
-- remain globally unique.
DROP INDEX `MattermostConversationLink_channelName_key` ON `MattermostConversationLink`;
