import type { Session, User } from "@prisma/client";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MATTERMOST_INTERNAL_URL?: string;
      MATTERMOST_ADMIN_TOKEN?: string;
      MATTERMOST_PLUGIN_SECRET?: string;
      MATTERMOST_SYNC_ENABLED?: string;
      MATTERMOST_PLUGIN_ID?: string;
      MATTERMOST_CALLBACK_URL?: string;
      MATTERMOST_CALLBACK_HEALTH_URL?: string;
      MATTERMOST_RUNTIME_ENV_FILE?: string;
    }
  }
}

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  monthlyWorkloadTargetHours: number | null;
  themePreference: string;
  locale: string;
  emailNotificationsEnabled: boolean;
};

declare module "h3" {
  interface H3EventContext {
    user: CurrentUser | null;
    session: (Session & { user: User }) | null;
  }
}
