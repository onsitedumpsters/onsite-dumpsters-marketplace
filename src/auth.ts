import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit, AUTH_RATE_LIMIT, clientIp } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Allow linking Google to an existing credentials account by email.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "Email and password",
      credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials, req) {
        const ip = req?.headers ? clientIp(req.headers as unknown as Headers) : "unknown";
        const rl = await rateLimit(`auth:${ip}`, AUTH_RATE_LIMIT);
        if (!rl.ok) throw new Error("Too many attempts. Please wait a minute and try again.");

        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "client";
        token.userId = user.id;
      } else if (token.userId) {
        // Refresh role from DB so admin changes take effect.
        const dbUser = await db.user.findUnique({
          where: { id: token.userId as string },
          select: { role: true },
        });
        if (dbUser) token.role = dbUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.userId as string;
        (session.user as { role?: string }).role = (token.role as string) ?? "client";
      }
      return session;
    },
  },
  pages: { signIn: "/signin" },
});
