import type { Session, User } from "@prisma/client";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

declare module "h3" {
  interface H3EventContext {
    user: CurrentUser | null;
    session: (Session & { user: User }) | null;
  }
}
