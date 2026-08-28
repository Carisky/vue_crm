import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-05-15",
  devtools: { enabled: true },
  // Server sourcemaps are enabled by default and noticeably increase Nitro's
  // peak memory usage. Production runs do not consume them.
  sourcemap: false,

  app: {
    head: {
      link: [
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "/TSL%20Silesia%20Collab.svg",
        },
        { rel: "apple-touch-icon", href: "/TSL%20Silesia%20Collab.png" },
      ],
    },
  },

  css: ["~/assets/css/main.css"],
  vite: { plugins: [tailwindcss()] },

  modules: [
    "shadcn-nuxt",
    "@nuxt/fonts",
    "@nuxt/image",
    "@nuxt/icon",
    "@pinia/nuxt",
  ],
  nitro: {
    output: {
      // Deployment builds use a staging directory so a failed/OOM build
      // cannot destroy the last working server bundle.
      dir: process.env.NITRO_OUTPUT_DIR || ".output",
    },
    externals: {
      // Prisma 7's generated CommonJS entry imports `.prisma/client`, which
      // Nitro's file tracer treats as an invalid package specifier. The app is
      // deployed with `npm ci`, so runtime dependencies can stay external.
      trace: false,
      external: ["@prisma/client", "@prisma/adapter-mariadb"],
    },
  },

  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    sessionSecret: process.env.SESSION_SECRET,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpSecure: process.env.SMTP_SECURE,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME,
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    public: {
      sessionCookieName: process.env.PUBLIC_SESSION_COOKIE_NAME,
      siteUrl: process.env.PUBLIC_SITE_URL,
    },
  },

  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: "",
    /**
     * Directory that the component lives in.
     * @default "./components/ui"
     */
    componentDir: "./components/ui",
  },

  fonts: {
    families: [{ name: "Inter", provider: "google" }],
    defaults: {
      weights: ["400 700"],
      styles: ["normal", "italic"],
      subsets: ["latin"],
    },
  },
});
