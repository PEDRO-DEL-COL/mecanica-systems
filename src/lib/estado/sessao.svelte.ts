import { supabase } from '../supabase';
import { oficina } from './oficina.svelte';

export interface UsuarioSessao {
  id: string;
  email: string;
}

class SessaoEstado {
  usuario = $state<UsuarioSessao | null>(null);

  definir(usuario: UsuarioSessao) {
    this.usuario = usuario;
  }

  limpar() {
    this.usuario = null;
    oficina.limpar();
  }

  /** Encerra a sessão (mesmo se a rede falhar, limpa o local). */
  async sair() {
    try {
      await supabase.auth.signOut();
    } finally {
      this.limpar();
    }
  }
}

export const sessao = new SessaoEstado();
