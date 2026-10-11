/**
 * Value Object: NIT (Colombia)
 * Formato: 9 dígitos + dígito de verificación.
 * Algoritmo oficial DIAN para cálculo del DV.
 */
export class NIT {
  private constructor(
    private readonly number: string,
    private readonly checkDigit: number,
  ) {}

  static of(rawNit: string): NIT {
    const cleaned = rawNit.replace(/[.\-\s]/g, '');
    const match = cleaned.match(/^(\d{9})(\d)$/);
    if (!match) {
      throw new Error('NIT: invalid format, expected 10 digits');
    }
    const [, number, dv] = match;
    const expected = NIT.calculateCheckDigit(number);
    if (expected !== Number(dv)) {
      throw new Error(`NIT: invalid check digit, expected ${expected}`);
    }
    return new NIT(number, Number(dv));
  }

  static calculateCheckDigit(number: string): number {
    const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    const digits = number.split('').reverse().map(Number);
    const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
    const mod = sum % 11;
    return mod < 2 ? mod : 11 - mod;
  }

  get full(): string {
    return `${this.number}-${this.checkDigit}`;
  }

  get raw(): string {
    return this.number;
  }

  toString(): string {
    return this.full;
  }
}
