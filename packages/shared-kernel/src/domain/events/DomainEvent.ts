/**
 * Contrato base para todos los eventos de dominio.
 * Los eventos son inmutables y llevan tenantId para trazabilidad multi-tenant.
 */
export interface DomainEvent {
  readonly eventId: string;
  readonly eventName: string;
  readonly tenantId: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly version: number;
  readonly payload: Record<string, unknown>;
}

export abstract class BaseDomainEvent implements DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly version: number = 1;

  constructor(
    public readonly eventName: string,
    public readonly tenantId: string,
    public readonly aggregateId: string,
    public readonly payload: Record<string, unknown>,
  ) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
  }
}
