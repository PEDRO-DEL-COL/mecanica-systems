import { supabase } from '../supabase';
import { executar } from './base';
import { falha, mapearErro, ok, type ErroApp, type Resultado } from '../erros';
import { ehArea, ehNivel, type Papel, type Permissoes } from '../puro/permissoes';

export interface OficinaUsuario {
  membroId: string;
  orgId: string;
  papel: Papel;
  nome: string;
  documento: string | null;
  permissoes: Permissoes;
}

interface LinhaMembro {
  id: string;
  org_id: string;
  papel: Papel;
  organizacao: { id: string; nome: string; documento: string | null } | null;
}

/** Membro ativo do usuário + oficina + permissões. null = usuário sem oficina. */
export async function carregarOficinaDoUsuario(userId: string): Promise<Resultado<OficinaUsuario | null>> {
  const m = await executar(
    () =>
      supabase
        .from('membro')
        .select('id, org_id, papel, organizacao(id, nome, documento)')
        .eq('user_id', userId)
        .eq('ativo', true)
        .limit(1) as unknown as PromiseLike<{ data: LinhaMembro[] | null; error: unknown }>
  );
  if (!m.ok) return falha(m.erro);
  const membro = m.dados?.[0];
  if (!membro || !membro.organizacao) return ok(null);

  const permissoes: Permissoes = {};
  if (membro.papel === 'funcionario') {
    const p = await executar(
      () =>
        supabase.from('membro_permissao').select('area, nivel').eq('membro_id', membro.id) as unknown as PromiseLike<{
          data: { area: string; nivel: string }[] | null;
          error: unknown;
        }>
    );
    if (!p.ok) return falha(p.erro);
    for (const l of p.dados ?? []) {
      if (ehArea(l.area) && ehNivel(l.nivel)) permissoes[l.area] = l.nivel;
    }
  }
  return ok({
    membroId: membro.id,
    orgId: membro.org_id,
    papel: membro.papel,
    nome: membro.organizacao.nome,
    documento: membro.organizacao.documento,
    permissoes
  });
}

const MENSAGENS_CRIAR: Record<string, string> = {
  '42501': 'Confirme seu e-mail antes de cadastrar a oficina.',
  '23505': 'Você já faz parte de uma oficina.',
  '22023': 'Nome da oficina inválido.',
  '28000': 'Sessão expirada. Entre novamente.'
};

/** RPC criar_oficina: devolve o id da nova oficina. */
export async function criarOficina(nome: string, documento: string | null): Promise<Resultado<string>> {
  try {
    const { data, error } = await supabase.rpc('criar_oficina', {
      p_nome: nome,
      p_documento: (documento ?? undefined) as string
    });
    if (error) {
      const msg = MENSAGENS_CRIAR[String((error as { code?: unknown }).code ?? '')];
      const erro: ErroApp = msg ? { codigo: 'regra', mensagem: msg } : mapearErro(error);
      return falha(erro);
    }
    return ok(String(data));
  } catch (e) {
    return falha(mapearErro(e));
  }
}
