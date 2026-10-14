"""Enums compartidos — espejo del schema Prisma."""
from enum import Enum


class TenantPlan(str, Enum):
    STARTER = "STARTER"
    PROFESSIONAL = "PROFESSIONAL"
    ENTERPRISE = "ENTERPRISE"


class TenantStatus(str, Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    TRIAL = "TRIAL"
    CANCELLED = "CANCELLED"


class UserStatus(str, Enum):
    PENDING_VERIFICATION = "pending"  # <--- CAMBIA ESTA LÍNEA
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"


class RoleScope(str, Enum):
    PLATFORM = "PLATFORM"
    TENANT = "TENANT"
    BRANCH = "BRANCH"


class TableStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    OCCUPIED = "OCCUPIED"
    RESERVED = "RESERVED"
    CLEANING = "CLEANING"
    OUT_OF_SERVICE = "OUT_OF_SERVICE"


class TableSessionStatus(str, Enum):
    OPEN = "OPEN"
    BILLING = "BILLING"
    PAID = "PAID"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class OrderStatus(str, Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    SENT_TO_KITCHEN = "SENT_TO_KITCHEN"
    IN_PREPARATION = "IN_PREPARATION"
    READY = "READY"
    SERVED = "SERVED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class OrderChannel(str, Enum):
    POS = "POS"
    QR_MENU = "QR_MENU"
    WAITER_APP = "WAITER_APP"
    KIOSK = "KIOSK"
    API = "API"


class OrderItemStatus(str, Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    PREPARING = "PREPARING"
    READY = "READY"
    SERVED = "SERVED"
    VOID = "VOID"


class PaymentMethod(str, Enum):
    CASH = "CASH"
    CREDIT_CARD = "CREDIT_CARD"
    DEBIT_CARD = "DEBIT_CARD"
    PSE = "PSE"
    NEQUI = "NEQUI"
    DAVIPLATA = "DAVIPLATA"
    TRANSFER = "TRANSFER"
    BONO = "BONO"
    OTHER = "OTHER"


class PaymentStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    REFUNDED = "REFUNDED"
    VOIDED = "VOIDED"


class InvoiceStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_DIAN = "PENDING_DIAN"
    SENT_DIAN = "SENT_DIAN"
    ACCEPTED_DIAN = "ACCEPTED_DIAN"
    REJECTED_DIAN = "REJECTED_DIAN"
    CANCELLED = "CANCELLED"


class InvoiceType(str, Enum):
    ELECTRONIC_SALE = "ELECTRONIC_SALE"
    ELECTRONIC_CREDIT_NOTE = "ELECTRONIC_CREDIT_NOTE"
    ELECTRONIC_DEBIT_NOTE = "ELECTRONIC_DEBIT_NOTE"
    POS_EQUIVALENT = "POS_EQUIVALENT"


class DianEnvironment(str, Enum):
    HABILITACION = "HABILITACION"
    PRODUCCION = "PRODUCCION"


class CustomerDocType(str, Enum):
    NIT = "NIT"
    CC = "CC"
    CE = "CE"
    PASSPORT = "PASSPORT"
    FOREIGN_NIT = "FOREIGN_NIT"
    FINAL_CONSUMER = "FINAL_CONSUMER"


class RecipeStatus(str, Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class WasteReason(str, Enum):
    SPOILAGE = "SPOILAGE"
    OVERPRODUCTION = "OVERPRODUCTION"
    CUSTOMER_RETURN = "CUSTOMER_RETURN"
    PREPARATION_ERROR = "PREPARATION_ERROR"
    EXPIRED = "EXPIRED"
    OTHER = "OTHER"


class NotificationChannel(str, Enum):
    EMAIL = "EMAIL"
    SMS = "SMS"
    PUSH = "PUSH"
    WHATSAPP = "WHATSAPP"


class NotificationStatus(str, Enum):
    QUEUED = "QUEUED"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"
    BOUNCED = "BOUNCED"


class OutboxStatus(str, Enum):
    PENDING = "PENDING"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"
