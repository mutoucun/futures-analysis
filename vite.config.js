import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      // 新版本发布后 service worker 自动更新（数据随构建产物一起下发，手机无感升级）
      registerType: 'autoUpdate',
      manifest: {
        name: '国内期货日线数据分析平台',
        short_name: '期货分析',
        description: '国内期货日线数据的季节性叠线、连续时序与月度涨跌分析，支持跨月/跨品种价差',
        lang: 'zh-CN',
        theme_color: '#1a6fe0',
        background_color: '#f4f6f9',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // app shell（index/echarts/pinyin/css/html/图标）全量预缓存，首访后离线秒开；
        // 品种数据 chunk（NAME_MM-哈希.js，如 RB_09-xxx.js）不预缓存——50 品种全量 20MB+，
        // 改为运行时按需缓存：用户查过哪个品种才下载并长期缓存哪个
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
        globIgnores: ['assets/[A-Z]*_[0-9][0-9]-*.js'],
        runtimeCaching: [
          {
            // 数据 chunk 带内容哈希，同 URL 内容永不变，CacheFirst 安全
            urlPattern: /assets\/[A-Z0-9]+_[0-9]{2}-[A-Za-z0-9_-]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'futures-data-chunks',
              expiration: { maxEntries: 400, maxAgeSeconds: 365 * 24 * 60 * 60 }
            }
          }
        ]
      }
    })
  ],
  // 相对路径部署：任意静态托管的任意子路径均可直接访问
  base: './',
  server: {
    port: 3000,
    open: false
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts'],
          pinyin: ['pinyin-pro']
        }
      }
    }
  }
})
