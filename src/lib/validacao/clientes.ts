import * as v from 'valibot';
import {
  documentoSchema,
  emailSchema,
  placaSchema,
  telefoneOpcionalSchema
} from './comum';
import { normalizarTelefone } from '../puro/formatos';

/** Texto opcional: vazio => null; senão trim e limite de tamanho. */
function textoOpcional(max: number, mensagem: string) {
  return v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((s: string | null) => (s === null || s.trim() === '' ? null : s.trim())),
    v.check((s) => s === null || s.length <= max, mensagem)
  );
}

/** E-mail opcional: vazio => null; senão valida como emailSchema. */
const emailOpcionalSchema = v.pipe(
  v.optional(v.nullable(v.string()), null),
  v.rawTransform<string | null, string | null>(({ dataset, addIssue, NEVER }) => {
    const s = dataset.value;
    if (s === null || s.trim() === '') return null;
    const r = v.safeParse(emailSchema, s);
    if (!r.success) {
      addIssue({ message: r.issues[0]?.message ?? 'E-mail inválido.' });
      return NEVER;
    }
    return r.output;
  })
);

export const clienteSchema = v.object({
  nome: v.pipe(
    v.string('Informe o nome.'),
    v.trim(),
    v.minLength(1, 'Informe o nome.'),
    v.maxLength(200, 'Nome muito longo (máximo 200).')
  ),
  documento: documentoSchema,
  telefone: telefoneOpcionalSchema,
  email: emailOpcionalSchema,
  endereco: textoOpcional(500, 'Endereço muito longo (máximo 500).'),
  observacoes: textoOpcional(2000, 'Observações muito longas (máximo 2000).')
});

export type ClienteValidado = v.InferOutput<typeof clienteSchema>;

const kmSchema = v.pipe(
  v.number('Informe a quilometragem.'),
  v.integer('Quilometragem deve ser um número inteiro.'),
  v.minValue(0, 'Quilometragem não pode ser negativa.'),
  v.maxValue(9999999, 'Quilometragem muito alta.')
);

const anoSchema = v.pipe(
  v.optional(v.nullable(v.number()), null),
  v.check((n) => n === null || (Number.isInteger(n) && n >= 1900 && n <= 2100), 'Ano inválido.')
);

const chassiSchema = v.pipe(
  v.optional(v.nullable(v.string()), null),
  v.transform((s: string | null) =>
    s === null || s.trim() === '' ? null : s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  ),
  v.check((s) => s === null || /^[A-Z0-9]{5,25}$/.test(s), 'Chassi inválido (5 a 25 letras/números).')
);

export const veiculoEdicaoSchema = v.object({
  placa: placaSchema,
  marca: v.pipe(
    v.string('Informe a marca.'),
    v.trim(),
    v.minLength(1, 'Informe a marca.'),
    v.maxLength(60, 'Marca muito longa (máximo 60).')
  ),
  modelo: v.pipe(
    v.string('Informe o modelo.'),
    v.trim(),
    v.minLength(1, 'Informe o modelo.'),
    v.maxLength(80, 'Modelo muito longo (máximo 80).')
  ),
  ano: anoSchema,
  cor: textoOpcional(40, 'Cor muito longa (máximo 40).'),
  chassi: chassiSchema,
  km_atual: v.optional(kmSchema, 0)
});

export const veiculoSchema = v.object({
  ...veiculoEdicaoSchema.entries,
  cliente_id: v.pipe(v.string('Selecione o cliente.'), v.uuid('Cliente inválido.'))
});

export type VeiculoValidado = v.InferOutput<typeof veiculoSchema>;

/**
 * Termo de busca para a coluna `busca` do banco (sem acento, minúscula, espaços
 * colapsados). Menos de 2 caracteres => null (sem filtro). Só dígitos/telefone
 * formatado => dígitos (a coluna guarda o telefone só com dígitos).
 */
export function normalizarTermoBusca(entrada: string | null | undefined): string | null {
  const bruto = (entrada ?? '').trim();
  if (/^[\d\s()+.-]+$/.test(bruto)) {
    const d = normalizarTelefone(bruto);
    return d.length >= 2 ? d : null;
  }
  const t = bruto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  // Placa digitada com hífen/espaço (ABC-1234): a coluna guarda sem separador.
  const placa = t.replace(/[\s-]/g, '');
  if (/^[a-z]{3}[\s-]?[0-9]/.test(t) && /^[a-z]{3}[0-9][a-z0-9]?[0-9]{0,2}$/.test(placa)) {
    return placa;
  }
  return t.length >= 2 ? t : null;
}

/** Escapa curingas do LIKE/ILIKE (\, %, _) para busca literal. */
export function escaparLike(termo: string): string {
  return termo.replace(/[\%_]/g, (c) => `\${c}`);
}
