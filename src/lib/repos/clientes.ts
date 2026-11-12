import { supabase } from '../supabase';
import { executar, intervalo, TAMANHO_PAGINA } from './base';
import { falha, mapearErro, ok, type Resultado } from '../erros';
import type {
  Cliente,
  ClienteEntrada,
  ListaClientesParametros,
  PaginaDe
} from '../tipos/clientes';
import { clienteSchema, escaparLike, normalizarTermoBusca } from '../validacao/clientes';
import * as v from 'valibot';

/** Colunas lidas (sem `busca`, que é interna do banco). */
const COLUNAS =
  'id, org_id, nome, documento, telefone, email, endereco, observacoes, ativo, versao, criado_em, atualizado_em';

function validar(entrada: ClienteEntrada): Resultado<ClienteEntrada> {
  const r = v.safeParse(clienteSchema, entrada);
  if (!r.success) {
    return falha({ codigo: 'invalido', mensagem: r.issues[0]?.message ?? 'Dados inválidos.' });
  }
  return ok(r.output);
}

/** Lista com busca (nome/telefone, sem acento) e página de 25. Ordena por nome. */
export async function listarClientes(
  parametros: ListaClientesParametros = {}
): Promise<Resultado<PaginaDe<Cliente>>> {
  const pagina = parametros.pagina ?? 1;
  const { from, to } = intervalo(pagina);
  const termo = normalizarTermoBusca(parametros.busca);
  let total = 0;
  const r = await executar<Cliente[]>(async () => {
    let q = supabase.from('cliente').select(COLUNAS, { count: 'exact' });
    if (!parametros.incluirInativos) q = q.eq('ativo', true);
    if (termo) q = q.ilike('busca', `%${escaparLike(termo)}%`);
    const res = await q.order('nome').order('id').range(from, to);
    total = res.count ?? 0;
    return res as { data: Cliente[] | null; error: unknown };
  });
  if (!r.ok) return r;
  return ok({ itens: r.dados ?? [], total, pagina, tamanho: TAMANHO_PAGINA });
}

export async function obterCliente(id: string): Promise<Resultado<Cliente>> {
  return executar<Cliente>(() =>
    supabase.from('cliente').select(COLUNAS).eq('id', id).single()
  );
}

export async function criarCliente(entrada: ClienteEntrada): Promise<Resultado<Cliente>> {
  const val = validar(entrada);
  if (!val.ok) return val;
  // org_id: o banco exige a oficina do usuário (RLS); obtida da própria sessão.
  const org = await oficinaAtual();
  if (!org.ok) return org;
  return executar<Cliente>(() =>
    supabase
      .from('cliente')
      .insert({ ...val.dados, org_id: org.dados })
      .select(COLUNAS)
      .single()
  );
}

/** Atualiza com controle otimista: falha com "conflito" se a versão mudou. */
export async function atualizarCliente(
  id: string,
  versao: number,
  entrada: ClienteEntrada
): Promise<Resultado<Cliente>> {
  const val = validar(entrada);
  if (!val.ok) return val;
  return executar<Cliente>(
    () =>
      supabase.from('cliente').update(val.dados).eq('id', id).eq('versao', versao).select(COLUNAS).single(),
    { conflitoVersao: true }
  );
}

function alterarAtivo(id: string, versao: number, ativo: boolean): Promise<Resultado<Cliente>> {
  return executar<Cliente>(
    () => supabase.from('cliente').update({ ativo }).eq('id', id).eq('versao', versao).select(COLUNAS).single(),
    { conflitoVersao: true }
  );
}

export function desativarCliente(id: string, versao: number): Promise<Resultado<Cliente>> {
  return alterarAtivo(id, versao, false);
}

export function reativarCliente(id: string, versao: number): Promise<Resultado<Cliente>> {
  return alterarAtivo(id, versao, true);
}

/** org_id da oficina do usuário (primeira linha visível de organizacao). */
async function oficinaAtual(): Promise<Resultado<string>> {
  try {
    const { data, error } = await supabase.from('organizacao').select('id').limit(1).single();
    if (error) return falha(mapearErro(error));
    return ok((data as { id: string }).id);
  } catch (e) {
    return falha(mapearErro(e));
  }
}

export { oficinaAtual };
