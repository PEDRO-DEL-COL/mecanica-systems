import * as v from 'valibot';
import { dinheiroSchema } from './comum';
import { normalizarQuantidade } from '../puro/formatos';

/** Texto opcional: vazio => null; senão sem espaços nas pontas e até `max` caracteres. */
export function textoOpcional(max: number, rotulo: string) {
  return v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((s: string | null) => {
      const t = (s ?? '').trim();
      return t === '' ? null : t;
    }),
    v.check((s) => s === null || s.length <= max, `${rotulo}: no máximo ${max} caracteres.`)
  );
}

/** Quantidade >= 0 (até 3 casas), vazio => '0'. Devolve string decimal canônica. */
export const quantidadeNaoNegativaSchema = v.pipe(
  v.optional(v.nullable(v.string()), null),
  v.rawTransform<string | null, string>(({ dataset, addIssue, NEVER }) => {
    const s = (dataset.value ?? '').trim();
    if (s === '') return '0';
    const q = normalizarQuantidade(s);
    if (q === null) {
      addIssue({ message: 'Quantidade inválida. Use até 3 casas decimais.' });
      return NEVER;
    }
    return q;
  })
);

/** Formulário de item do catálogo (preço digitado em reais). */
export const itemCatalogoSchema = v.pipe(
  v.object({
    tipo: v.picklist(['servico', 'peca'], 'Escolha serviço ou peça.'),
    codigo: textoOpcional(60, 'Código'),
    codigo_fabricante: textoOpcional(60, 'Código do fabricante'),
    descricao: v.pipe(
      v.string('Informe a descrição.'),
      v.trim(),
      v.nonEmpty('Informe a descrição.'),
      v.maxLength(300, 'Descrição: no máximo 300 caracteres.')
    ),
    unidade: v.pipe(
      v.optional(v.string(), 'un'),
      v.trim(),
      v.transform((s: string) => (s === '' ? 'un' : s)),
      v.maxLength(10, 'Unidade: no máximo 10 caracteres.')
    ),
    preco_venda_centavos: dinheiroSchema,
    controla_estoque: v.optional(v.boolean(), false),
    estoque_minimo: quantidadeNaoNegativaSchema,
    localizacao: textoOpcional(60, 'Localização')
  }),
  // Serviço nunca controla estoque (o banco também recusa).
  v.transform((d) => (d.tipo === 'servico' ? { ...d, controla_estoque: false, estoque_minimo: '0' } : d))
);

export type EntradaItemCatalogo = v.InferInput<typeof itemCatalogoSchema>;
export type SaidaItemCatalogo = v.InferOutput<typeof itemCatalogoSchema>;
