import * as v from 'valibot';
import { dinheiroSchema, quantidadeSchema } from './comum';
import { textoOpcional } from './catalogo';
import { normalizarQuantidade } from '../puro/formatos';

const idSchema = (mensagem: string) => v.pipe(v.string(mensagem), v.uuid(mensagem));

const idOpcionalSchema = (mensagem: string) =>
  v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((s: string | null) => (s && s.trim() !== '' ? s.trim() : null)),
    v.check((s) => s === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s), mensagem)
  );

/** Motivo obrigatório (ajuste/estorno), 3 a 500 caracteres. */
export const motivoSchema = v.pipe(
  v.string('Informe o motivo.'),
  v.trim(),
  v.nonEmpty('Informe o motivo.'),
  v.minLength(3, 'Motivo: pelo menos 3 caracteres.'),
  v.maxLength(500, 'Motivo: no máximo 500 caracteres.')
);

/** Quantidade com sinal, diferente de zero, até 3 casas ('-1,5' => '-1.5'). */
export const deltaSchema = v.pipe(
  v.string('Informe a quantidade.'),
  v.rawTransform<string, string>(({ dataset, addIssue, NEVER }) => {
    const t = dataset.value.trim().replace(/\s/g, '');
    const negativo = t.startsWith('-');
    const q = normalizarQuantidade(t.replace(/^[-+]/, ''));
    if (q === null || /^0(\.0+)?$/.test(q)) {
      addIssue({ message: 'Quantidade inválida. Use até 3 casas decimais, diferente de zero (negativa para saída).' });
      return NEVER;
    }
    return negativo ? `-${q}` : q;
  })
);

/** Entrada de compra: custo digitado em reais. */
export const entradaSchema = v.object({
  item_id: idSchema('Escolha a peça.'),
  quantidade: quantidadeSchema,
  custo_unitario_centavos: dinheiroSchema,
  fornecedor_id: idOpcionalSchema('Fornecedor inválido.'),
  nota_fiscal: textoOpcional(60, 'Nota fiscal')
});

export const ajusteSchema = v.object({
  item_id: idSchema('Escolha a peça.'),
  delta: deltaSchema,
  motivo: motivoSchema
});

export const devolucaoSchema = v.object({
  entrada_id: idSchema('Escolha a entrada.'),
  quantidade: quantidadeSchema,
  motivo: v.pipe(
    textoOpcional(500, 'Motivo'),
    v.check((s) => s === null || s.length >= 3, 'Motivo: pelo menos 3 caracteres.')
  )
});

export const estornoSchema = v.object({
  movimento_id: idSchema('Movimento inválido.'),
  motivo: motivoSchema
});

export type SaidaEntrada = v.InferOutput<typeof entradaSchema>;
export type SaidaAjuste = v.InferOutput<typeof ajusteSchema>;
export type SaidaDevolucao = v.InferOutput<typeof devolucaoSchema>;
export type SaidaEstorno = v.InferOutput<typeof estornoSchema>;
