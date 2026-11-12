export type TomToast = 'sucesso' | 'erro' | 'aviso';

export interface ItemToast {
  id: number;
  tom: TomToast;
  mensagem: string;
}

const DURACAO_PADRAO: Record<TomToast, number> = { sucesso: 4000, aviso: 6000, erro: 8000 };

class FilaToast {
  itens = $state<ItemToast[]>([]);
  #proximo = 1;
  #timers = new Map<number, ReturnType<typeof setTimeout>>();

  mostrar(tom: TomToast, mensagem: string, duracaoMs = DURACAO_PADRAO[tom]): number {
    const id = this.#proximo++;
    this.itens.push({ id, tom, mensagem });
    if (duracaoMs > 0) this.#timers.set(id, setTimeout(() => this.fechar(id), duracaoMs));
    return id;
  }
  sucesso(mensagem: string, duracaoMs?: number) {
    return this.mostrar('sucesso', mensagem, duracaoMs);
  }
  erro(mensagem: string, duracaoMs?: number) {
    return this.mostrar('erro', mensagem, duracaoMs);
  }
  aviso(mensagem: string, duracaoMs?: number) {
    return this.mostrar('aviso', mensagem, duracaoMs);
  }
  fechar(id: number) {
    const t = this.#timers.get(id);
    if (t) clearTimeout(t);
    this.#timers.delete(id);
    this.itens = this.itens.filter((i) => i.id !== id);
  }
}

export const toast = new FilaToast();
