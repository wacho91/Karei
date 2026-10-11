/**
 * Value Object: TenantId
 * Identificador único del tenant (restaurante / cadena).
 * Base del aislamiento multi-tenant.
 */
export class TenantId {
  private constructor(private readonly value: string) {}

  static of(value: string): TenantId {
    if (!value || value.trim().length === 0) {
      throw new Error('TenantId: cannot be empty');
    }
    if (!/^[a-z0-9-]{3,64}$/.test(value)) {
      throw new Error(
        'TenantId: must be lowercase alphanumeric with dashes (3-64 chars)',
      );
    }
    return new TenantId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: TenantId): boolean {
    return this.value === other.value;
  }
}
