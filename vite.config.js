import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/glpi-api': {
          target: env.VITE_GLPI_URL,
          rewrite: (path) => path.replace(/^\/glpi-api/, ''),
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
