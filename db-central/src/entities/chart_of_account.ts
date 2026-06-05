import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export type AccountType = "asset" | "liability" | "income" | "expense" | "equity";
export type NormalBalance = "debit" | "credit";

/**
 * ChartOfAccount — master list of general ledger accounts used in double-entry bookkeeping.
 * Scoped globally (not per account) so all portals share the same standard chart.
 * Seeded via property-portal migration/seed script.
 *
 * Standard numbering:
 *   1xxx = Assets     (normal balance: debit)
 *   2xxx = Liabilities (normal balance: credit)
 *   3xxx = Equity      (normal balance: credit)
 *   4xxx = Income      (normal balance: credit)
 *   5xxx = Expenses    (normal balance: debit)
 */
@Entity("chart_of_accounts")
export class ChartOfAccount {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  code: string; // e.g. "4100"

  @Column()
  name: string; // e.g. "Rental Income"

  @Column()
  type: AccountType; // 'asset' | 'liability' | 'income' | 'expense' | 'equity'

  @Column()
  normalBalance: NormalBalance; // 'debit' | 'credit' — increases this side

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isSystemAccount: boolean; // Cannot be deleted by users

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Seed data for the standard property management chart of accounts.
 * Used by the property portal seed/migration to insert defaults.
 */
export const STANDARD_CHART_OF_ACCOUNTS: Omit<
  ChartOfAccount,
  "id" | "createdAt" | "updatedAt"
>[] = [
  // ── Assets ──────────────────────────────────────────────────────────────
  { code: "1100", name: "Cash - Operating",        type: "asset",     normalBalance: "debit",  description: "Primary operating bank account",              isActive: true, isSystemAccount: true },
  { code: "1200", name: "Rent Receivable",          type: "asset",     normalBalance: "debit",  description: "Rent owed but not yet collected",             isActive: true, isSystemAccount: true },
  { code: "1210", name: "Security Deposit Held",    type: "asset",     normalBalance: "debit",  description: "Security deposits held in escrow/trust",      isActive: true, isSystemAccount: true },
  { code: "1300", name: "Prepaid Expenses",         type: "asset",     normalBalance: "debit",  description: "Expenses paid in advance",                    isActive: true, isSystemAccount: false },
  // ── Liabilities ─────────────────────────────────────────────────────────
  { code: "2100", name: "Security Deposit Liability", type: "liability", normalBalance: "credit", description: "Obligation to return security deposits",     isActive: true, isSystemAccount: true },
  { code: "2200", name: "Prepaid Rent",             type: "liability", normalBalance: "credit", description: "Rent collected in advance of the period",     isActive: true, isSystemAccount: false },
  { code: "2300", name: "Accounts Payable",         type: "liability", normalBalance: "credit", description: "Vendor invoices awaiting payment",            isActive: true, isSystemAccount: false },
  // ── Income ───────────────────────────────────────────────────────────────
  { code: "4100", name: "Rental Income",            type: "income",    normalBalance: "credit", description: "Monthly rent revenue from tenants",           isActive: true, isSystemAccount: true },
  { code: "4200", name: "Late Fee Income",          type: "income",    normalBalance: "credit", description: "Fees charged for late rent payments",         isActive: true, isSystemAccount: false },
  { code: "4300", name: "Application Fee Income",   type: "income",    normalBalance: "credit", description: "Non-refundable tenant application fees",      isActive: true, isSystemAccount: false },
  { code: "4900", name: "Other Income",             type: "income",    normalBalance: "credit", description: "Miscellaneous income",                       isActive: true, isSystemAccount: false },
  // ── Expenses ─────────────────────────────────────────────────────────────
  { code: "5100", name: "Maintenance & Repairs",    type: "expense",   normalBalance: "debit",  description: "Routine maintenance and repair costs",        isActive: true, isSystemAccount: false },
  { code: "5200", name: "Property Management Fee",  type: "expense",   normalBalance: "debit",  description: "Fees paid to property management company",    isActive: true, isSystemAccount: false },
  { code: "5300", name: "Insurance Expense",        type: "expense",   normalBalance: "debit",  description: "Property and liability insurance premiums",   isActive: true, isSystemAccount: false },
  { code: "5400", name: "Property Tax Expense",     type: "expense",   normalBalance: "debit",  description: "Annual property tax payments",                isActive: true, isSystemAccount: false },
  { code: "5500", name: "Utilities Expense",        type: "expense",   normalBalance: "debit",  description: "Water, gas, electricity for common areas",    isActive: true, isSystemAccount: false },
  { code: "5600", name: "Landscaping Expense",      type: "expense",   normalBalance: "debit",  description: "Lawn care and exterior maintenance",          isActive: true, isSystemAccount: false },
  { code: "5700", name: "Capital Improvements",     type: "expense",   normalBalance: "debit",  description: "Major improvements increasing property value", isActive: true, isSystemAccount: false },
];
