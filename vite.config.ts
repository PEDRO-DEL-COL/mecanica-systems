import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ pages: 'build', assets: 'build', fallback: '200.html', strict: false }),
      // /entrar e /cadastro ainda nao existem (T3); remover quando forem criadas.
      prerender: {
        handleHttpError: ({ path, message }) => {
          if (path === '/entrar' || path === '/cadastro') return;
          throw new Error(message);
        }
      }
    })
  ],
  test: { include: ['tests/**/*.test.ts'] }
});
