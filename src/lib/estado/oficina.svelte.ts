import { pode as podePuro, type Area, type Nivel } from '../puro/permissoes';
import type { OficinaUsuario } from '../repos/oficina';

class OficinaEstado {
  dados = $state<OficinaUsuario | null>(null);
  userId = $state<string | null>(null);

  get nome() {
    return this.dados?.nome ?? '';
  }

  definir(userId: string, dados: OficinaUsuario) {
    this.userId = userId;
    this.dados = dados;
  }

  limpar() {
    this.userId = null;
    this.dados = null;
  }

  /** Espelha private.pode: dono sempre; funcionário por mapa; escrita implica leitura. */
  pode(area: Area, nivel: Nivel = 'leitura'): boolean {
    return podePuro(this.dados?.papel, this.dados?.permissoes ?? {}, area, nivel);
  }
}

export const oficina = new OficinaEstado();

export function pode(area: Area, nivel: Nivel = 'leitura'): boolean {
  return oficina.pode(area, nivel);
}
