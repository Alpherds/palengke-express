// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-12-21',
  devtools: { enabled: true },

  // ssr: false,
  modules: ['@nuxt/fonts', 'vuetify-nuxt-module', '@nuxt/eslint'],

  app: {
    head: {
      link: [
        { rel: 'stylesheet', href: '/layers.css' },
      ],
    },
  },

  vuetify: {
    moduleOptions: {
      styles: { configFile: 'assets/styles/settings.scss' },
    },
    vuetifyOptions: {
      theme: {
        defaultTheme: 'light', // default 'system' requires `ssr: false` to avoid hydration warnings
      },
    },
  },

   runtimeConfig: {
    public: {
      strapiUrl: 'http://localhost:1337',
    },
  },


  eslint: {
    config: {
      import: {
        package: 'eslint-plugin-import-lite',
      },
    },
  },
})