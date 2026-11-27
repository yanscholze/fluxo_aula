import { parseMoney } from "./money";

const currencies = new Map<string, Intl.NumberFormat>();

export function money(value: number, currency = "BRL") {
  let formatter = currencies.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
    currencies.set(currency, formatter);
  }
  return formatter.format(value / 100);
}

export const inputMoney = (value: number) =>
  (value / 100).toFixed(2).replace(".", ",");

export function readMoney(value: string) {
  const result = parseMoney(value);
  if (result === null || !Number.isSafeInteger(result)) {
    throw new Error("Informe um valor monetário válido.");
  }
  return result;
}
