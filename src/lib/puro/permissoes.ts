/** Lógica pura de permissões por área. Espelha private.pode (supabase/migrations). A barreira real é RLS/RPC; a UI só esconde. */

export const AREAS = [
  'clientes',
  'veiculos',
  'catalogo',
  'estoque',
  'ordens',
  'caixa',
  'financeiro',
  'equipe',
  'configuracoes'
] as const;

export type Area = (typeof AREAS)[number];
export type Nivel = 'leitura' | 'escrita';
export type Papel = 'dono' | 'funcionario';
/** Sem linha = sem acesso. */
export type Permissoes = Partial<Record<Area, Nivel>>;

export function ehArea(valor: unknown): valor is Area {
  return typeof valor === 'string' && (AREAS as readonly string[]).includes(valor);
}

export function ehNivel(valor: unknown): valor is Nivel {
  return valor === 'leitura' || valor === 'escrita';
}

/** Dono: sempre true. Funcionário: conforme o mapa; 'escrita' implica 'leitura'. */
export function pode(
  papel: Papel | null | undefined,
  permissoes: Permissoes,
  area: Area,
  nivel: Nivel = 'leitura'
): boolean {
  if (papel === 'dono') return true;
  if (papel !== 'funcionario') return false;
  if (!ehArea(area) || !Object.hasOwn(permissoes, area)) return false;
  const atual = permissoes[area];
  return atual === 'escrita' || (atual === 'leitura' && nivel === 'leitura');
}
