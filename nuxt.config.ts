import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-05-15",
  devtools: { enabled: true },

  app: {
    head: {
      link: [{ rel: "icon", type: "image/png", href: "/favicon.png" }],
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
    externals: {
      external: ["@prisma/client", ".prisma/client", ".prisma"],
    },
  },

  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    sessionSecret: process.env.SESSION_SECRET,
    githubClientId: process.env.GITHUB_CLIENT_ID,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
    public: {
      sessionCookieName: process.env.PUBLIC_SESSION_COOKIE_NAME,
      siteUrl: process.env.PUBLIC_SITE_URL,
      oauthGitHubCallbackUrl: process.env.PUBLIC_OAUTH_CALLBACK_URL_GITHUB,
      githubClientId: process.env.GITHUB_CLIENT_ID,
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
