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
