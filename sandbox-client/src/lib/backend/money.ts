export function rupeesToPaise(value: number): bigint {
  return BigInt(Math.round(value * 100));
}

export function paiseToRupees(value: number | string | bigint): number {
  const paise = typeof value === "bigint" ? Number(value) : Number(value);
  return Math.trunc(paise / 100);
}

export function bigintToNumber(value: bigint | number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}
