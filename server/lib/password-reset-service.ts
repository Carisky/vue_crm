import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

type PasswordUser = {
  id: string;
  email: string;
  passwordHash: string | null;
};

type PasswordResetToken = {
  id: string;
  userId: string;
  expiresAt: Date;
};

type RequestPasswordResetDependencies = {
  findUserByEmail(email: string): Promise<PasswordUser | null>;
  saveToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  deliverResetLink(input: {
    userId: string;
    email: string;
    token: string;
    expiresAt: Date;
  }): Promise<void>;
  now?: () => Date;
};

type ResetPasswordDependencies = {
  findToken(tokenHash: string): Promise<PasswordResetToken | null>;
  hashPassword(password: string): Promise<string>;
  commitPasswordReset(input: {
    userId: string;
    tokenId: string;
    passwordHash: string;
  }): Promise<void>;
  now?: () => Date;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPasswordResetSecret(
  now = new Date(),
  createRandomBytes: (size: number) => Buffer = randomBytes,
) {
  const token = createRandomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
  };
}

export async function requestPasswordReset(
  email: string,
  dependencies: RequestPasswordResetDependencies,
) {
  const user = await dependencies.findUserByEmail(email.trim().toLowerCase());

  if (user?.passwordHash) {
    const secret = createPasswordResetSecret(dependencies.now?.() ?? new Date());
    await dependencies.saveToken({
      userId: user.id,
      tokenHash: secret.tokenHash,
      expiresAt: secret.expiresAt,
    });
    await dependencies.deliverResetLink({
      userId: user.id,
      email: user.email,
      token: secret.token,
      expiresAt: secret.expiresAt,
    });
  }

  return { ok: true as const };
}

export async function resetPassword(
  token: string,
  password: string,
  dependencies: ResetPasswordDependencies,
) {
  const storedToken = await dependencies.findToken(hashToken(token));
  const now = dependencies.now?.() ?? new Date();

  if (!storedToken || storedToken.expiresAt.getTime() <= now.getTime()) {
    return false;
  }

  const passwordHash = await dependencies.hashPassword(password);
  await dependencies.commitPasswordReset({
    userId: storedToken.userId,
    tokenId: storedToken.id,
    passwordHash,
  });
  return true;
}
