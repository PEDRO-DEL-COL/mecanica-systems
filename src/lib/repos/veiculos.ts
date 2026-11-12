import { supabase } from '../supabase';
import { executar, intervalo, TAMANHO_PAGINA } from './base';
import { oficinaAtual } from './clientes';
import { falha, ok, type Resultado } from '../erros';
import type { PaginaDe } from '../tipos/clientes';
import type {
  ListaVeiculosParametros,
  Veiculo,
  VeiculoEdicao,
  VeiculoEntrada
} from '../tipos/veiculos';
import {
  escaparLike,
  normalizarTermoBusca,
  veiculoEdicaoSchema,
  veiculoSchema
} from '../validacao/clientes';
import { normalizarPlaca } from '../puro/placa';
import * as v from 'valibot';

const COLUNAS =
  'id, org_id, cliente_id, placa, marca, modelo, ano, cor, chassi, km_atual, ativo, versao, criado_em, atualizado_em';

/** Lista com busca (placa/marca/modelo) e página de 25. Ordena por placa. */
export async function listarVeiculos(
  parametros: ListaVeiculosParametros = {}
): Promise<Resultado<PaginaDe<Veiculo>>> {
  const pagina = parametros.pagina ?? 1;
  const { from, to } = intervalo(pagina);
  const termo = normalizarTermoBusca(parametros.busca);
  let total = 0;
  const r = await executar<Veiculo[]>(async () => {
    let q = supabase.from('veiculo').select(COLUNAS, { count: 'exact' });
    if (!parametros.incluirInativos) q = q.eq('ativo', true);
    if (parametros.clienteId) q = q.eq('cliente_id', parametros.clienteId);
    if (termo) q = q.ilike('busca', `%${escaparLike(termo)}%`);
    const res = await q.order('placa').order('id').range(from, to);
    total = res.count ?? 0;
    return res as { data: Veiculo[] | null; error: unknown };
  });
  if (!r.ok) return r;
  return ok({ itens: r.dados ?? [], total, pagina, tamanho: TAMANHO_PAGINA });
}

export async function obterVeiculo(id: string): Promise<Resultado<Veiculo>> {
  return executar<Veiculo>(() => supabase.from('veiculo').select(COLUNAS).eq('id', id).single());
}

/** Veículo ATIVO com a placa informada (qualquer formato); nulo se não existir. */
export async function buscarPorPlaca(placa: string): Promise<Resultado<Veiculo | null>> {
  const p = normalizarPlaca(placa);
  if (!p) return ok(null);
  return executar<Veiculo | null>(() =>
    supabase.from('veiculo').select(COLUNAS).eq('placa', p).eq('ativo', true).maybeSingle()
  );
}

export async function criarVeiculo(entrada: VeiculoEntrada): Promise<Resultado<Veiculo>> {
  const val = v.safeParse(veiculoSchema, entrada);
  if (!val.success) {
    return falha({ codigo: 'invalido', mensagem: val.issues[0]?.message ?? 'Dados inválidos.' });
  }
  const org = await oficinaAtual();
  if (!org.ok) return org;
  return executar<Veiculo>(() =>
    supabase
      .from('veiculo')
      .insert({ ...val.output, org_id: org.dados })
      .select(COLUNAS)
      .single()
  );
}

/** Atualiza com controle otimista (cliente_id só muda por transferirVeiculo). */
export async function atualizarVeiculo(
  id: string,
  versao: number,
  entrada: VeiculoEdicao
): Promise<Resultado<Veiculo>> {
  const val = v.safeParse(veiculoEdicaoSchema, entrada);
  if (!val.success) {
    return falha({ codigo: 'invalido', mensagem: val.issues[0]?.message ?? 'Dados inválidos.' });
  }
  return executar<Veiculo>(
    () =>
      supabase.from('veiculo').update(val.output).eq('id', id).eq('versao', versao).select(COLUNAS).single(),
    { conflitoVersao: true }
  );
}

function alterarAtivo(id: string, versao: number, ativo: boolean): Promise<Resultado<Veiculo>> {
  return executar<Veiculo>(
    () => supabase.from('veiculo').update({ ativo }).eq('id', id).eq('versao', versao).select(COLUNAS).single(),
    { conflitoVersao: true }
  );
}

export function desativarVeiculo(id: string, versao: number): Promise<Resultado<Veiculo>> {
  return alterarAtivo(id, versao, false);
}

/** Falha com "duplicado" se outra placa ativa igual existir na oficina. */
export function reativarVeiculo(id: string, versao: number): Promise<Resultado<Veiculo>> {
  return alterarAtivo(id, versao, true);
}

/** RPC transferir_veiculo: troca o dono, audita e valida a oficina do destino. */
export async function transferirVeiculo(
  veiculoId: string,
  novoClienteId: string
): Promise<Resultado<Veiculo>> {
  return executar<Veiculo>(() =>
    supabase.rpc('transferir_veiculo', {
      p_veiculo_id: veiculoId,
      p_novo_cliente_id: novoClienteId
    })
  );
}
