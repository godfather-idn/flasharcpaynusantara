// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  nitro: {
    preset: 'netlify',
    routeRules: {
      '/apple-app-site-association': {
        headers: {
          'Content-Type': 'application/json'
        }
      },
      '/.well-known/assetlinks.json': {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    }
  },
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },

  // SPA Mode to avoid Web3/window hydration mismatches
  ssr: false,

  modules: ['@nuxtjs/tailwindcss'],

  typescript: {
    strict: true,
    typeCheck: true
  },

  app: {
    head: {
      title: 'FlashArcPay Nusantara',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Indonesian QRIS-Standard Payment Experience Built Native on Arc Network' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.json' }
      ]
    }
  }
})
