/**
 * Value Object: Money
 * Inmutable. Representa un monto monetario con su moneda.
 * Regla: nunca usar number flotante para dinero en el dominio.
 */
export class Money {
  private constructor(
    private readonly amountInCents: number,
    private readonly currency: string,
  ) {}

  static of(amount: number, currency = 'COP'): Money {
    if (!Number.isFinite(amount)) {
      throw new Error('Money: amount must be a finite number');
    }
    return new Money(Math.round(amount * 100), currency.toUpperCase());
  }

  static fromCents(cents: number, currency = 'COP'): Money {
    return new Money(cents, currency.toUpperCase());
  }

  get cents(): number {
    return this.amountInCents;
  }

  get currencyCode(): string {
    return this.currency;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountInCents + other.amountInCents, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountInCents - other.amountInCents, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amountInCents * factor), this.currency);
  }

  applyTax(rate: number): Money {
    return new Money(
      Math.round(this.amountInCents * (1 + rate)),
      this.currency,
    );
  }

  isZero(): boolean {
    return this.amountInCents === 0;
  }

  equals(other: Money): boolean {
    return (
      this.amountInCents === other.amountInCents &&
      this.currency === other.currency
    );
  }

  toDecimal(): number {
    return this.amountInCents / 100;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Money: cannot operate between ${this.currency} and ${other.currency}`,
      );
    }
  }
}
