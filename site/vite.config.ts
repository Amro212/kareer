import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: '../site-dist',
    emptyOutDir: true,
    rolldownOptions: { input: {
      home: fileURLToPath(new URL('./index.html', import.meta.url)),
      privacy: fileURLToPath(new URL('./privacy/index.html', import.meta.url)),
      terms: fileURLToPath(new URL('./terms/index.html', import.meta.url)),
      setup: fileURLToPath(new URL('./setup/index.html', import.meta.url)),
      notFound: fileURLToPath(new URL('./404.html', import.meta.url)),
    }, output: { codeSplitting: { groups: [
      { name: 'motion', test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/ },
      { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
    ] } } },
  },
});
