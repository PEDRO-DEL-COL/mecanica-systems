import * as v from 'valibot';
import { documentoSchema, telefoneOpcionalSchema } from './comum';
import { textoOpcional } from './catalogo';

/** E-mail opcional: vazio => null; senão minúsculo e válido. */
const emailOpcionalSchema = v.pipe(
  v.optional(v.nullable(v.string()), null),
  v.transform((s: string | null) => {
    const t = (s ?? '').trim().toLowerCase();
    return t === '' ? null : t;
  }),
  v.check((s) => s === null || (s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)), 'E-mail inválido.')
);

export const fornecedorSchema = v.object({
  nome: v.pipe(
    v.string('Informe o nome.'),
    v.trim(),
    v.nonEmpty('Informe o nome.'),
    v.maxLength(200, 'Nome: no máximo 200 caracteres.')
  ),
  documento: documentoSchema,
  contato: textoOpcional(200, 'Contato'),
  telefone: telefoneOpcionalSchema,
  email: emailOpcionalSchema,
  observacao: textoOpcional(1000, 'Observação')
});

export type EntradaFornecedor = v.InferInput<typeof fornecedorSchema>;
export type SaidaFornecedor = v.InferOutput<typeof fornecedorSchema>;
