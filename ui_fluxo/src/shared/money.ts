/** Interpreta reais em formato brasileiro ou decimal e devolve centavos. */
export function parseMoney(input: string): number | null {
  const amount = digitsToCents(input);
  if (amount === null || !Number.isSafeInteger(amount)) return null;
  return amount === 0 ? 0 : amount;
}

function digitsToCents(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  const parenthesized = /^\((.*)\)$/.exec(raw);
  const body = parenthesized ? parenthesized[1] : raw;

  const cleaned = body.replace(/[R$\s ]/gi, "");
  if (!cleaned) return null;

  const negative = Boolean(parenthesized) || cleaned.startsWith("-");
  const digitsAndSeparators = cleaned.replace(/^[+-]/, "");
  if (!/^[\d.,]+$/.test(digitsAndSeparators)) return null;

  const split = splitDecimal(digitsAndSeparators);

  const digits = split.integerPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(digits) || !/^\d*$/.test(split.fractionPart)) return null;
  if (!digits && !split.fractionPart) return null;

  // Arredonda a fração em vez de truncar: `0,005` vale meio centavo e precisa
  // virar 1, não sumir.
  const fractionValue = split.fractionPart
    ? Number(`0.${split.fractionPart}`)
    : 0;
  if (!Number.isFinite(fractionValue)) return null;
  const total = Number(digits || "0") * 100 + Math.round(fractionValue * 100);
  if (!Number.isFinite(total)) return null;

  return negative ? -total : total;
}

/**
 * Decide qual separador é decimal e qual é milhar.
 *
 * O caso difícil é um separador só, seguido de exatamente três dígitos:
 * `1.500` é mil e quinhentos, mas `0,005` é meio centavo. A regra:
 *
 * - dois tipos de separador presentes: o **último** é o decimal;
 * - o mesmo separador repetido: é milhar (`1.500.000`);
 * - um separador só, cauda de 1 ou 2 dígitos: é decimal;
 * - um separador só, cauda de 3 dígitos: é milhar **se** a parte inteira tiver
 *   de 1 a 3 dígitos e não começar com zero — `0,005` começa com zero, logo é
 *   decimal;
 * - qualquer outra cauda: decimal (milhar sempre agrupa de três em três).
 */
function splitDecimal(value: string): {
  integerPart: string;
  fractionPart: string;
} {
  const dots = (value.match(/\./g) ?? []).length;
  const commas = (value.match(/,/g) ?? []).length;

  if (dots === 0 && commas === 0)
    return { integerPart: value, fractionPart: "" };

  const asThousands = { integerPart: value, fractionPart: "" };

  if (dots > 0 && commas > 0) {
    const splitAt = Math.max(value.lastIndexOf("."), value.lastIndexOf(","));
    return {
      integerPart: value.slice(0, splitAt),
      fractionPart: value.slice(splitAt + 1),
    };
  }

  const separator = dots > 0 ? "." : ",";
  const count = dots > 0 ? dots : commas;
  if (count > 1) return asThousands;

  const splitAt = value.lastIndexOf(separator);
  const head = value.slice(0, splitAt);
  const tail = value.slice(splitAt + 1);

  if (tail.length === 3) {
    const isThousands =
      head.length >= 1 && head.length <= 3 && !head.startsWith("0");
    return isThousands
      ? asThousands
      : { integerPart: head, fractionPart: tail };
  }

  return { integerPart: head, fractionPart: tail };
}
