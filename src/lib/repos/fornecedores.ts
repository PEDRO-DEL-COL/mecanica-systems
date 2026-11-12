import { supabase } from '../supabase';
import type { Resultado } from '../erros';
import { executar, intervalo } from './base';
import { padraoBusca, paginar } from './catalogo';
import type { Pagina } from '../tipos/catalogo';
import type { DadosFornecedor, FiltroFornecedores, Fornecedor } from '../tipos/fornecedores';

const COLUNAS =
  'id, org_id, nome, documento, contato, telefone, email, observacao, ativo, versao, criado_em, atualizado_em';

export function listarFornecedores(
  filtro: FiltroFornecedores = {},
  sinal?: AbortSignal
): Promise<Resultado<Pagina<Fornecedor>>> {
  const pagina = filtro.pagina ?? 1;
  const { from, to } = intervalo(pagina);
  return paginar<Fornecedor>(() => {
    let q = supabase.from('fornecedor').select(COLUNAS, { count: 'estimated' });
    if (!filtro.mostrarInativos) q = q.eq('ativo', true);
    const busca = padraoBusca(filtro.busca);
    if (busca) q = q.ilike('busca', busca);
    q = q.order('nome').order('id').range(from, to);
    if (sinal) q = q.abortSignal(sinal);
    return q;
  }, pagina);
}

export function obterFornecedor(id: string): Promise<Resultado<Fornecedor>> {
  return executar<Fornecedor>(() => supabase.from('fornecedor').select(COLUNAS).eq('id', id).single());
}

/** Cria fornecedor (org_id vem do banco). `id` opcional gerado no cliente. */
export function criarFornecedor(dados: DadosFornecedor, id?: string): Promise<Resultado<Fornecedor>> {
  const linha: DadosFornecedor & { id?: string } = id ? { ...dados, id } : dados;
  return executar<Fornecedor>(() => supabase.from('fornecedor').insert(linha).select(COLUNAS).single());
}

export function atualizarFornecedor(
  id: string,
  versao: number,
  dados: Partial<DadosFornecedor>
): Promise<Resultado<Fornecedor>> {
  return executar<Fornecedor>(
    () => supabase.from('fornecedor').update(dados).eq('id', id).eq('versao', versao).select(COLUNAS).single(),
    { conflitoVersao: true }
  );
}

export function definirAtivoFornecedor(id: string, versao: number, ativo: boolean): Promise<Resultado<Fornecedor>> {
  return executar<Fornecedor>(
    () => supabase.from('fornecedor').update({ ativo }).eq('id', id).eq('versao', versao).select(COLUNAS).single(),
    { conflitoVersao: true }
  );
}
