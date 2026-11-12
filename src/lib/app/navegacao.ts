import type { Area } from '../puro/permissoes';

export interface ItemNavegacao {
  area: Area;
  rotulo: string;
  rota: string;
  /** Conteúdo interno de um <svg viewBox="0 0 24 24"> (constante do código, não vem de usuário). */
  icone: string;
}

export const ITENS_NAVEGACAO: readonly ItemNavegacao[] = [
  {
    area: 'clientes',
    rotulo: 'Clientes',
    rota: '/app/clientes',
    icone:
      '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.6 3.5 2.6 3.5 5.7"/>'
  },
  {
    area: 'veiculos',
    rotulo: 'Veículos',
    rota: '/app/veiculos',
    icone:
      '<path d="M5 16l1.6-5.2A2 2 0 0 1 8.5 9.4h7a2 2 0 0 1 1.9 1.4L19 16"/><rect x="3" y="16" width="18" height="4" rx="1.5"/>'
  },
  {
    area: 'catalogo',
    rotulo: 'Catálogo',
    rota: '/app/catalogo',
    icone: '<path d="M4 6h16M4 12h16M4 18h10"/>'
  },
  {
    area: 'estoque',
    rotulo: 'Estoque',
    rota: '/app/estoque',
    icone: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>'
  },
  {
    area: 'ordens',
    rotulo: 'Ordens de serviço',
    rota: '/app/ordens',
    icone: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'
  },
  {
    area: 'caixa',
    rotulo: 'Caixa',
    rota: '/app/caixa',
    icone: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'
  },
  {
    area: 'financeiro',
    rotulo: 'Financeiro',
    rota: '/app/financeiro',
    icone: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>'
  },
  {
    area: 'equipe',
    rotulo: 'Equipe',
    rota: '/app/equipe',
    icone: '<circle cx="10" cy="8" r="3.5"/><path d="M3 20c0-3.6 3-6 7-6s7 2.4 7 6M19 8v6M16 11h6"/>'
  },
  {
    area: 'configuracoes',
    rotulo: 'Configurações',
    rota: '/app/configuracoes',
    icone: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
  }
];

/** Item cuja rota é a do caminho atual (ou prefixo dela). */
export function itemDoCaminho(caminho: string): ItemNavegacao | undefined {
  const c = caminho.length > 1 ? caminho.replace(/\/+$/, '') : caminho;
  return ITENS_NAVEGACAO.find((i) => c === i.rota || c.startsWith(i.rota + '/'));
}
