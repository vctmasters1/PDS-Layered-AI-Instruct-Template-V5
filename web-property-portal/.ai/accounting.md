# Accounting System

**Strategy**:
- Backend stores **all transactions** in accrual/double-entry format.
- `transactions` table = user-facing simple view.
- `accounting_entries` = detailed double-entry.

**UI Toggle**:
- User preference saved in profile: `accounting_view` ("cash" | "accrual")
- Frontend transforms data accordingly:
  - Cash: Only show when payment is received.
  - Accrual: Show income/expense when earned/incurred.

**Standard Transaction Codes** (Chart of Accounts):
- RENT-INCOME, SECURITY-DEPOSIT, LATE-FEE, MAINT-EXPENSE, REPAIR, UTILITY, etc.