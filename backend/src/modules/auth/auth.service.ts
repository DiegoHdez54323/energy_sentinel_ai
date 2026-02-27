import { prisma } from "../../lib/prisma.js";
import { comparePassword, hashPassword } from "./password.js";
import { signAccessToken } from "./jwt.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new Error("EMAIL_ALREADY_IN_USE");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });

  return { user, accessToken };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const validPassword = await comparePassword(
    input.password,
    user.passwordHash,
  );
  if (!validPassword) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
    accessToken,
  };
}
