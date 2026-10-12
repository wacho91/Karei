import { Money } from '@karei/shared-kernel';
import { OrderItem } from '../../../orders/domain/entities/OrderItem.entity';

/**
 * Aggregate Root: TableSession
 * Representa la "cuenta viva" de una mesa.
 * Invariantes:
 *  - No se puede cerrar una sesión con ítems pendientes de pago.
 *  - El total siempre es la suma de los ítems menos descuentos.
 *  - El split no puede exceder el total.
 */
export type TableSessionStatus = 'OPEN' | 'BILLING' | 'PAID' | 'CLOSED';

export class TableSession {
  private items: OrderItem[] = [];
  private status: TableSessionStatus = 'OPEN';
  private discount: Money;
  private tip: Money;

  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly tableId: string,
    public readonly openedAt: Date,
    public readonly openedBy: string,
    currency = 'COP',
  ) {
    this.discount = Money.of(0, currency);
    this.tip = Money.of(0, currency);
  }

  addItem(item: OrderItem): void {
    if (this.status !== 'OPEN') {
      throw new Error('TableSession: cannot add items to a non-open session');
    }
    this.items.push(item);
  }

  removeItem(itemId: string): void {
    if (this.status !== 'OPEN') {
      throw new Error('TableSession: cannot remove items from a non-open session');
    }
    this.items = this.items.filter((i) => i.id !== itemId);
  }

  applyDiscount(discount: Money): void {
    const subtotal = this.subtotal();
    if (discount.cents > subtotal.cents) {
      throw new Error('TableSession: discount cannot exceed subtotal');
    }
    this.discount = discount;
  }

  applyTip(tip: Money): void {
    this.tip = tip;
  }

  subtotal(): Money {
    return this.items.reduce(
      (acc, item) => acc.add(item.total()),
      Money.of(0, this.currency()),
    );
  }

  total(): Money {
    return this.subtotal().subtract(this.discount).add(this.tip);
  }

  startBilling(): void {
    if (this.items.length === 0) {
      throw new Error('TableSession: cannot bill an empty session');
    }
    this.status = 'BILLING';
  }

  markAsPaid(): void {
    if (this.status !== 'BILLING') {
      throw new Error('TableSession: must be in BILLING to mark as paid');
    }
    this.status = 'PAID';
  }

  close(): void {
    if (this.status !== 'PAID') {
      throw new Error('TableSession: cannot close an unpaid session');
    }
    this.status = 'CLOSED';
  }

  getStatus(): TableSessionStatus {
    return this.status;
  }

  getItems(): ReadonlyJSON<OrderItem> {
    return [...this.items];
  }

  private currency(): string {
    return this.items[0]?.currency ?? 'COP';
  }
}
