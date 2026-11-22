/**
 * Dual Unit of Measure (UoM) Stock Formatter
 * Converts raw base atomic units (tablets, capsules, ml) into a human-readable pharmacy display:
 * e.g., 790 units (pack size 200) -> "790 (3P + 190u)" or "3 Packs + 190 Loose"
 */

export function formatStockDisplay(totalBaseUnits: number | string, packSize: number | string = 1, compact: boolean = true): string {
  const units = Number(totalBaseUnits) || 0;
  const size = Number(packSize) || 1;

  if (size <= 1) {
    return `${units.toLocaleString()} units`;
  }

  const packs = Math.floor(units / size);
  const loose = units % size;

  if (compact) {
    if (packs === 0) {
      return `${loose}u`;
    }
    if (loose === 0) {
      return `${packs}P (${units}u)`;
    }
    return `${packs}P + ${loose}u (${units}u)`;
  }

  // Full verbose label
  if (packs === 0) {
    return `${loose} Loose Units`;
  }
  if (loose === 0) {
    return `${packs} ${packs === 1 ? 'Pack' : 'Packs'} (${units.toLocaleString()} Units)`;
  }
  return `${packs} ${packs === 1 ? 'Pack' : 'Packs'} + ${loose} Loose (${units.toLocaleString()} Units)`;
}

export function calculateBaseUnits(
  quantity: number | string,
  bonusQuantity: number | string = 0,
  packSize: number | string = 1,
  unitType: 'Pack' | 'Loose' | string = 'Pack'
): number {
  const qty = Number(quantity) || 0;
  const bonus = Number(bonusQuantity) || 0;
  const size = Number(packSize) || 1;
  const multiplier = (unitType === 'Pack' && size > 1) ? size : 1;
  return (qty + bonus) * multiplier;
}
