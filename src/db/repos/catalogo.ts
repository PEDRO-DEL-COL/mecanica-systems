import type { Executor } from './tipos';
import { ErroValidacao } from './tipos';

export type TipoItem = 'peca' | 'servico';

export interface ItemCatalogo {
  id: number;
  tipo: TipoItem;
  codigo: string | null;
  descricao: string;
  precoCusto: number; // centavos
  precoVenda: number; // centavos
  estoqueAtual: number;
  estoqueMinimo: number;
  localEstoque: string | null;
  ativo: boolean;
}

export interface DadosItem {
  tipo: TipoItem;
  codigo?: string | null;
  descricao: string;
  precoCusto?: number | null; // centavos inteiros
  precoVenda: number; // centavos inteiros
  estoqueAtual?: number | null; // so pecas
  estoqueMinimo?: number | null; // so pecas
  localEstoque?: string | null; // so pecas
}

export interface FiltroCatalogo {
  filtro?: string;
  tipo?: TipoItem;
  incluirInativos?: boolean;
}

const COLS = 'id, tipo, codigo, descricao, preco_custo, preco_venda, estoque_atual, estoque_minimo, local_estoque, ativo';
const MSG_DUP = 'Código já cadastrado';

const txt = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

function centavos(v: number | null | undefined, nome: string, obrigatorio: boolean): number {
  if (v === null || v === undefined) {
    if (obrigatorio) throw new ErroValidacao(`Informe o ${nome}.`);
    return 0;
  }
  if (!Number.isSafeInteger(v) || v < 0) throw new ErroValidacao(`${nome[0].toUpperCase() + nome.slice(1)} inválido.`);
  return v;
}

function qtd(v: number | null | undefined, nome: string): number {
  if (v === null || v === undefined) return 0;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new ErroValidacao(`${nome} inválido.`);
  return v;
}

function converter(l: Record<string, unknown>): ItemCatalogo {
  return {
    id: Number(l.id),
    tipo: l.tipo as TipoItem,
    codigo: (l.codigo as string | null) ?? null,
    descricao: String(l.descricao),
    precoCusto: Number(l.preco_custo ?? 0),
    precoVenda: Number(l.preco_venda),
    estoqueAtual: Number(l.estoque_atual ?? 0),
    estoqueMinimo: Number(l.estoque_minimo ?? 0),
    localEstoque: (l.local_estoque as string | null) ?? null,
    ativo: Number(l.ativo) === 1,
  };
}

function preparar(d: DadosItem) {
  if (d.tipo !== 'peca' && d.tipo !== 'servico') throw new ErroValidacao('Tipo inválido.');
  const descricao = (d.descricao ?? '').trim();
  if (!descricao) throw new ErroValidacao('Informe a descrição.');
  const venda = centavos(d.precoVenda, 'preço de venda', true);
  const custo = centavos(d.precoCusto, 'preço de custo', false);
  const peca = d.tipo === 'peca';
  return {
    codigo: txt(d.codigo),
    vals: (codigo: string | null) =>
      [
        d.tipo,
        codigo,
        descricao,
        custo,
        venda,
        peca ? qtd(d.estoqueAtual, 'Estoque atual') : 0,
        peca ? qtd(d.estoqueMinimo, 'Estoque mínimo') : 0,
        peca ? txt(d.localEstoque) : null,
      ] as const,
  };
}

export function criarRepoCatalogo(db: Executor) {
  async function codigoExiste(codigo: string | null, ignorarId?: number): Promise<boolean> {
    if (!codigo) return false;
    const r = await db.query('SELECT id FROM item_catalogo WHERE lower(codigo) = lower(?) AND id <> ?', [
      codigo,
      ignorarId ?? -1,
    ]);
    return r.length > 0;
  }

  return {
    async criar(d: DadosItem): Promise<number> {
      const p = preparar(d);
      if (await codigoExiste(p.codigo)) throw new ErroValidacao(MSG_DUP);
      const rows = await db.query<{ id: number }>(
        'INSERT INTO item_catalogo (tipo, codigo, descricao, preco_custo, preco_venda, estoque_atual, estoque_minimo, local_estoque) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
        [...p.vals(p.codigo)],
      );
      return Number(rows[0].id);
    },

    async atualizar(id: number, d: DadosItem): Promise<void> {
      const p = preparar(d);
      if (await codigoExiste(p.codigo, id)) throw new ErroValidacao(MSG_DUP);
      const r = await db.exec(
        'UPDATE item_catalogo SET tipo=?, codigo=?, descricao=?, preco_custo=?, preco_venda=?, estoque_atual=?, estoque_minimo=?, local_estoque=? WHERE id=?',
        [...p.vals(p.codigo), id],
      );
      if (r.alteradas === 0) throw new ErroValidacao('Item não encontrado.');
    },

    async buscarPorId(id: number): Promise<ItemCatalogo | null> {
      const rows = await db.query(`SELECT ${COLS} FROM item_catalogo WHERE id = ?`, [id]);
      return rows[0] ? converter(rows[0]) : null;
    },

    /** Filtro parcial por descricao/codigo; por tipo; por padrao so ativos. */
    async listar(opc: FiltroCatalogo = {}): Promise<ItemCatalogo[]> {
      const where: string[] = [];
      const bind: string[] = [];
      if (!opc.incluirInativos) where.push('ativo = 1');
      if (opc.tipo) {
        where.push('tipo = ?');
        bind.push(opc.tipo);
      }
      const f = (opc.filtro ?? '').trim().toLowerCase();
      if (f) {
        where.push("(lower(descricao) LIKE ? OR lower(coalesce(codigo,'')) LIKE ?)");
        bind.push(`%${f}%`, `%${f}%`);
      }
      const sql = `SELECT ${COLS} FROM item_catalogo ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY lower(descricao), id`;
      return (await db.query(sql, bind)).map(converter);
    },

    /** Pecas ativas com estoque_atual <= estoque_minimo e minimo > 0. */
    async listarEstoqueBaixo(): Promise<ItemCatalogo[]> {
      const rows = await db.query(
        `SELECT ${COLS} FROM item_catalogo WHERE tipo = 'peca' AND ativo = 1 AND estoque_minimo > 0 AND estoque_atual <= estoque_minimo ORDER BY lower(descricao), id`,
      );
      return rows.map(converter);
    },

    /** Nunca DELETE: apenas marca ativo = 0. */
    async inativar(id: number): Promise<void> {
      await db.exec('UPDATE item_catalogo SET ativo = 0 WHERE id = ?', [id]);
    },

    async reativar(id: number): Promise<void> {
      await db.exec('UPDATE item_catalogo SET ativo = 1 WHERE id = ?', [id]);
    },
  };
}
