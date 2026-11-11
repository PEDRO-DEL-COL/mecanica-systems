import { validarPlaca } from '../../lib/placa';
import type { Cliente } from './clientes';
import type { Executor } from './tipos';
import { ErroValidacao } from './tipos';

export interface Veiculo {
  id: number;
  clienteId: number;
  placa: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  cor: string | null;
  chassi: string | null;
  kmAtual: number | null;
}

export interface DadosVeiculo {
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  ano?: number | null;
  cor?: string | null;
  chassi?: string | null;
  kmAtual?: number | null;
}

export interface VeiculoComCliente {
  veiculo: Veiculo;
  cliente: Pick<Cliente, 'id' | 'nome' | 'telefone' | 'ativo'>;
}

const COLS = 'id, cliente_id, placa, marca, modelo, ano, cor, chassi, km_atual';
const MSG_DUP = 'Placa já cadastrada';

const txt = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};
const num = (v: number | null | undefined, nome: string): number | null => {
  if (v === null || v === undefined || (v as unknown) === '') return null;
  if (!Number.isInteger(v) || v < 0) throw new ErroValidacao(`${nome} inválido.`);
  return v;
};
const nn = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function converter(l: Record<string, unknown>, p = ''): Veiculo {
  return {
    id: Number(l[p + 'id']),
    clienteId: Number(l[p + 'cliente_id']),
    placa: String(l[p + 'placa']),
    marca: (l[p + 'marca'] as string | null) ?? null,
    modelo: (l[p + 'modelo'] as string | null) ?? null,
    ano: nn(l[p + 'ano']),
    cor: (l[p + 'cor'] as string | null) ?? null,
    chassi: (l[p + 'chassi'] as string | null) ?? null,
    kmAtual: nn(l[p + 'km_atual']),
  };
}

function preparar(d: DadosVeiculo) {
  let placa: string;
  try {
    placa = validarPlaca(d.placa ?? '');
  } catch (e) {
    throw new ErroValidacao((e as Error).message);
  }
  return [placa, txt(d.marca), txt(d.modelo), num(d.ano, 'Ano'), txt(d.cor), txt(d.chassi), num(d.kmAtual, 'Km')] as const;
}

const ehUnique = (e: unknown) => /UNIQUE/i.test(e instanceof Error ? e.message : String(e));

export function criarRepoVeiculos(db: Executor) {
  async function placaExiste(placa: string, ignorarId?: number): Promise<boolean> {
    const r = await db.query('SELECT id FROM veiculo WHERE placa = ? AND id <> ?', [placa, ignorarId ?? -1]);
    return r.length > 0;
  }

  async function comCliente(where: string, bind: string[]): Promise<VeiculoComCliente[]> {
    const rows = await db.query(
      `SELECT v.id AS v_id, v.cliente_id AS v_cliente_id, v.placa AS v_placa, v.marca AS v_marca,
              v.modelo AS v_modelo, v.ano AS v_ano, v.cor AS v_cor, v.chassi AS v_chassi, v.km_atual AS v_km_atual,
              c.nome AS c_nome, c.telefone AS c_telefone, c.ativo AS c_ativo
         FROM veiculo v JOIN cliente c ON c.id = v.cliente_id
         ${where} ORDER BY v.placa LIMIT 200`,
      bind,
    );
    return rows.map((l) => {
      const veiculo = converter(l, 'v_');
      return {
        veiculo,
        cliente: {
          id: veiculo.clienteId,
          nome: String(l.c_nome),
          telefone: (l.c_telefone as string | null) ?? null,
          ativo: Number(l.c_ativo) === 1,
        },
      };
    });
  }

  return {
    async criar(clienteId: number, d: DadosVeiculo): Promise<number> {
      const v = preparar(d);
      if (await placaExiste(v[0])) throw new ErroValidacao(MSG_DUP);
      try {
        const rows = await db.query<{ id: number }>(
          'INSERT INTO veiculo (cliente_id, placa, marca, modelo, ano, cor, chassi, km_atual) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
          [clienteId, ...v],
        );
        return Number(rows[0].id);
      } catch (e) {
        if (ehUnique(e)) throw new ErroValidacao(MSG_DUP);
        if (/FOREIGN KEY/i.test(String(e))) throw new ErroValidacao('Cliente não encontrado.');
        throw e;
      }
    },

    async atualizar(id: number, d: DadosVeiculo): Promise<void> {
      const v = preparar(d);
      if (await placaExiste(v[0], id)) throw new ErroValidacao(MSG_DUP);
      try {
        const r = await db.exec(
          'UPDATE veiculo SET placa=?, marca=?, modelo=?, ano=?, cor=?, chassi=?, km_atual=? WHERE id=?',
          [...v, id],
        );
        if (r.alteradas === 0) throw new ErroValidacao('Veículo não encontrado.');
      } catch (e) {
        if (ehUnique(e)) throw new ErroValidacao(MSG_DUP);
        throw e;
      }
    },

    async buscarPorId(id: number): Promise<Veiculo | null> {
      const rows = await db.query(`SELECT ${COLS} FROM veiculo WHERE id = ?`, [id]);
      return rows[0] ? converter(rows[0]) : null;
    },

    async listarPorCliente(clienteId: number): Promise<Veiculo[]> {
      const rows = await db.query(`SELECT ${COLS} FROM veiculo WHERE cliente_id = ? ORDER BY placa`, [clienteId]);
      return rows.map((r) => converter(r));
    },

    /** Busca (parcial) por placa; aceita minuscula/hifen/espacos. Retorna veiculo + dono. */
    async buscarPorPlaca(texto: string): Promise<VeiculoComCliente[]> {
      const p = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!p) return [];
      return comCliente('WHERE v.placa LIKE ?', [`%${p}%`]);
    },

    /** Todos os veiculos (com dono), ordenados por placa. */
    async listarTodos(): Promise<VeiculoComCliente[]> {
      return comCliente('', []);
    },  };
}
