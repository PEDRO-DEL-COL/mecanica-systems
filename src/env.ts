import { defineEnvVars } from '@sveltejs/kit/env';

function obrigatoria(nome: string) {
  return (valor: string | undefined) => {
    if (!valor) {
      throw new Error(`Defina ${nome} no .env.local (veja .env.example).`);
    }
    return valor;
  };
}

export const variables = defineEnvVars({
  PUBLIC_SUPABASE_URL: { public: true, static: true, schema: obrigatoria('PUBLIC_SUPABASE_URL') },
  PUBLIC_SUPABASE_ANON_KEY: {
    public: true,
    static: true,
    schema: obrigatoria('PUBLIC_SUPABASE_ANON_KEY')
  }
});
