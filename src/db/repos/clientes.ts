import { normalizarDocumento } from '../../lib/documento';
import type { Executor } from './tipos';
import { ErroValidacao } from './tipos';

export interface Cliente {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  ativo: boolean;
}

export interface DadosCliente {
  nome: string;
  documento?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
}

const COLS = 'id, nome, documento, telefone, email, endereco, ativo';

const txt = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

function converter(l: Record<string, unknown>): Cliente {
  return {
    id: Number(l.id),
    nome: String(l.nome),
    documento: (l.documento as string | null) ?? null,
    telefone: (l.telefone as string | null) ?? null,
    email: (l.email as string | null) ?? null,
    endereco: (l.endereco as string | null) ?? null,
    ativo: Number(l.ativo) === 1,
  };
}

function preparar(d: DadosCliente) {
  const nome = (d.nome ?? '').trim();
  if (!nome) throw new ErroValidacao('Informe o nome do cliente.');
  let documento: string | null;
  try {
    documento = normalizarDocumento(d.documento);
  } catch (e) {
    throw new ErroValidacao((e as Error).message);
  }
  return [nome, documento, txt(d.telefone), txt(d.email), txt(d.endereco)] as const;
}

export function criarRepoClientes(db: Executor) {
  return {
    async criar(d: DadosCliente): Promise<number> {
      const rows = await db.query<{ id: number }>(
        'INSERT INTO cliente (nome, documento, telefone, email, endereco) VALUES (?,?,?,?,?) RETURNING id',
        [...preparar(d)],
      );
      return Number(rows[0].id);
    },

    async atualizar(id: number, d: DadosCliente): Promise<void> {
      const r = await db.exec(
        'UPDATE cliente SET nome=?, documento=?, telefone=?, email=?, endereco=? WHERE id=?',
        [...preparar(d), id],
      );
      if (r.alteradas === 0) throw new ErroValidacao('Cliente não encontrado.');
    },

    async buscarPorId(id: number): Promise<Cliente | null> {
      const rows = await db.query(`SELECT ${COLS} FROM cliente WHERE id = ?`, [id]);
      return rows[0] ? converter(rows[0]) : null;
    },

    /** Filtro por nome/telefone/documento/placa (parcial). Por padrao so ativos. */
    async listar(opc: { filtro?: string; incluirInativos?: boolean } = {}): Promise<Cliente[]> {
      const f = (opc.filtro ?? '').trim();
      const where: string[] = [];
      const bind: string[] = [];
      if (!opc.incluirInativos) where.push('c.ativo = 1');
      if (f) {
        const like = `%${f.toLowerCase()}%`;
        // So busca por digitos se o filtro nao tiver letras (evita casar "XYZ-1D" com documento).
        const dig = /[a-z]/i.test(f) ? '' : f.replace(/\D/g, '');
        const placa = f.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const partes = ['lower(c.nome) LIKE ?', "lower(coalesce(c.telefone,'')) LIKE ?"];
        bind.push(like, like);
        if (dig) {
          partes.push("coalesce(c.documento,'') LIKE ?");
          partes.push("replace(replace(replace(replace(coalesce(c.telefone,''),' ',''),'-',''),'(',''),')','') LIKE ?");
          bind.push(`%${dig}%`, `%${dig}%`);
        }
        if (placa) {
          partes.push('EXISTS (SELECT 1 FROM veiculo v WHERE v.cliente_id = c.id AND v.placa LIKE ?)');
          bind.push(`%${placa}%`);
        }
        where.push(`(${partes.join(' OR ')})`);
      }
      const sql = `SELECT ${COLS.split(', ').map((c) => 'c.' + c).join(', ')} FROM cliente c ${
        where.length ? 'WHERE ' + where.join(' AND ') : ''
      } ORDER BY lower(c.nome), c.id`;
      return (await db.query(sql, bind)).map(converter);
    },

    /** Nunca DELETE: apenas marca ativo = 0. */
    async inativar(id: number): Promise<void> {
      await db.exec('UPDATE cliente SET ativo = 0 WHERE id = ?', [id]);
    },

    async reativar(id: number): Promise<void> {
      await db.exec('UPDATE cliente SET ativo = 1 WHERE id = ?', [id]);
    },
  };
}