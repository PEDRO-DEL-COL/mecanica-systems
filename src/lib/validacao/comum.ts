import * as v from 'valibot';
import { validarPlaca } from '../puro/placa';
import { normalizarDocumento } from '../puro/documento';
import { parseReais } from '../puro/dinheiro';
import { normalizarTelefone, normalizarQuantidade } from '../puro/formatos';

/** Transforma funções que lançam Error em issue do valibot com a mensagem pt-BR. */
function viaFuncao<T>(fn: (s: string) => T) {
  return v.rawTransform<string, T>(({ dataset, addIssue, NEVER }) => {
    try {
      return fn(dataset.value);
    } catch (e) {
      addIssue({ message: e instanceof Error ? e.message : 'Valor inválido.' });
      return NEVER;
    }
  });
}

export const placaSchema = v.pipe(v.string('Informe a placa.'), viaFuncao(validarPlaca));

/** CPF/CNPJ opcional: vazio => null; senão só dígitos (11 ou 14). */
export const documentoSchema = v.pipe(
  v.optional(v.nullable(v.string()), null),
  v.rawTransform<string | null, string | null>(({ dataset, addIssue, NEVER }) => {
    try {
      return normalizarDocumento(dataset.value);
    } catch (e) {
      addIssue({ message: e instanceof Error ? e.message : 'Documento inválido.' });
      return NEVER;
    }
  })
);

/** Telefone BR com DDD, só dígitos (10 ou 11). */
export const telefoneSchema = v.pipe(
  v.string('Informe o telefone.'),
  v.transform((s: string) => normalizarTelefone(s)),
  v.check((d) => d.length === 10 || d.length === 11, 'Telefone inválido. Use DDD + número.'),
  v.check((d) => d.length !== 11 || d[2] === '9', 'Celular deve começar com 9 após o DDD.')
);

/** Telefone opcional: vazio => null. */
export const telefoneOpcionalSchema = v.pipe(
  v.optional(v.nullable(v.string()), null),
  v.rawTransform<string | null, string | null>(({ dataset, addIssue, NEVER }) => {
    const s = dataset.value;
    if (s === null || s.trim() === '') return null;
    const d = normalizarTelefone(s);
    if ((d.length !== 10 && d.length !== 11) || (d.length === 11 && d[2] !== '9')) {
      addIssue({ message: 'Telefone inválido. Use DDD + número.' });
      return NEVER;
    }
    return d;
  })
);

/** E-mail em minúsculas e sem espaços nas pontas. */
export const emailSchema = v.pipe(
  v.string('Informe o e-mail.'),
  v.trim(),
  v.toLowerCase(),
  v.nonEmpty('Informe o e-mail.'),
  v.email('E-mail inválido.')
);

/** Dinheiro digitado em reais -> centavos inteiros. */
export const dinheiroSchema = v.pipe(v.string('Informe o valor.'), viaFuncao(parseReais));

/** Centavos já inteiros (>= 0). */
export const centavosSchema = v.pipe(
  v.number('Informe o valor.'),
  v.integer('Valor inválido.'),
  v.minValue(0, 'Valor não pode ser negativo.'),
  v.safeInteger('Valor inválido.')
);

/** Quantidade decimal como string canônica ('1.5'), > 0, até 3 casas. */
export const quantidadeSchema = v.pipe(
  v.string('Informe a quantidade.'),
  v.rawTransform<string, string>(({ dataset, addIssue, NEVER }) => {
    const q = normalizarQuantidade(dataset.value);
    if (q === null || /^0(\.0+)?$/.test(q)) {
      addIssue({ message: 'Quantidade inválida. Use até 3 casas decimais, maior que zero.' });
      return NEVER;
    }
    return q;
  })
);

/** Primeira mensagem de erro por campo (chave = caminho com '.'). */
export function errosPorCampo(issues: ReadonlyArray<v.BaseIssue<unknown>>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const i of issues) {
    const k = i.path?.map((p) => String(p.key)).join('.') ?? '';
    if (!(k in r)) r[k] = i.message;
  }
  return r;
}
