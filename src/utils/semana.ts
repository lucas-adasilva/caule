export function getSemanaDaData(date: Date): { ano: number; num: number; weekId: string } {
  const ano = date.getFullYear();
  const jan4 = new Date(ano, 0, 4);
  const jan4Dia = jan4.getDay();
  const jan4Segunda = new Date(ano, 0, 4 - (jan4Dia === 0 ? 6 : jan4Dia - 1));
  const targetSegunda = new Date(date);
  const targetDia = targetSegunda.getDay();
  targetSegunda.setDate(targetSegunda.getDate() - (targetDia === 0 ? 6 : targetDia - 1));
  const diasDiff = Math.floor((targetSegunda.getTime() - jan4Segunda.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const numSemana = diasDiff + 1;
  return { ano, num: numSemana, weekId: `${ano}-W${String(numSemana).padStart(2, '0')}` };
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Retorna o intervalo Segunda..Domingo (YYYY-MM-DD) da semana que contém `date`. */
export function getIntervaloSemana(date: Date): { inicio: string; fim: string } {
  const segunda = new Date(date);
  const dia = segunda.getDay();
  segunda.setDate(segunda.getDate() - (dia === 0 ? 6 : dia - 1));
  const domingo = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);
  return { inicio: toDateStr(segunda), fim: toDateStr(domingo) };
}

/** Verifica se o período [dataInicio, dataFim] (YYYY-MM-DD) sobrepõe a semana atual. */
export function sobrepoeSemanaAtual(dataInicio?: string, dataFim?: string): boolean {
  if (!dataInicio || !dataFim) return false;
  const { inicio, fim } = getIntervaloSemana(new Date());
  return dataInicio <= fim && dataFim >= inicio;
}
