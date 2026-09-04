import { createHash } from "node:crypto";

const MAX_MATTERMOST_NAME_LENGTH = 64;
const ID_SUFFIX_LENGTH = 10;

const transliteration: Record<string, string> = {
  æ: "ae",
  đ: "d",
  ð: "d",
  ł: "l",
  ø: "o",
  œ: "oe",
  ß: "ss",
  þ: "th",
};

function slug(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[æđðłøœßþ]/g, (character) => transliteration[character] ?? "")
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableSuffix(id: string) {
  const components = id
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const candidate = components.at(-1) ?? "";
  if (candidate.length >= ID_SUFFIX_LENGTH) {
    return candidate.slice(0, ID_SUFFIX_LENGTH);
  }
  return createHash("sha256").update(id).digest("hex").slice(0, ID_SUFFIX_LENGTH);
}

function withStableSuffix(id: string, value: string) {
  const suffix = stableSuffix(id);
  const maxPrefixLength = MAX_MATTERMOST_NAME_LENGTH - suffix.length - 1;
  const prefix = (slug(value) || "crm")
    .slice(0, maxPrefixLength)
    .replace(/-+$/g, "") || "crm";
  return `${prefix}-${suffix}`;
}

export function mattermostUsername(userId: string, email: string) {
  return withStableSuffix(userId, email.split("@", 1)[0] ?? "");
}

export function mattermostTeamName(workspaceId: string, displayName: string) {
  return withStableSuffix(workspaceId, displayName);
}

export function mattermostChannelName(conversationId: string, nameOrType: string) {
  if (nameOrType === "WORKSPACE") {
    return "town-square";
  }
  return withStableSuffix(
    conversationId,
    nameOrType === "DIRECT" ? "dm" : nameOrType,
  );
}
