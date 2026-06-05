# Database Schema - pds-property-portal

**All tables must have**:
- `id` (UUID primary key)
- `account_id` (UUID, indexed, RLS)
- `created_at`, `updated_at`
- `created_by`, `updated_by` (user_id)

### Core Tables

**units**
- id, account_id
- unit_number (string)
- property_type (enum: apartment, house, commercial, etc.)
- address, city, state, zip
- bedrooms, bathrooms, square_feet
- monthly_rent (decimal)
- security_deposit (decimal)
- status (enum: vacant, occupied, maintenance, reserved)
- notes, photos (jsonb array of document ids)

**tenants**
- id, account_id
- full_name, email, phone
- date_of_birth, ssn (encrypted), emergency_contact
- status (active, former, applicant)

**leases**
- id, account_id
- unit_id → units
- tenant_id → tenants
- start_date, end_date
- monthly_rent, security_deposit_amount
- lease_document_id (references documents)
- status (active, expired, terminated)
- auto_renew (boolean)

**transactions**
- id, account_id
- lease_id / unit_id / tenant_id
- transaction_code (string, required - e.g. RENT, MAINT, REFUND)
- amount (decimal, signed)
- transaction_date
- payment_method (stripe, cash, check, etc.)
- stripe_payment_intent_id
- description
- is_reconciled (boolean)

**accounting_entries** (for double-entry)
- id, account_id
- transaction_id
- account_code (debit/credit chart of accounts)
- amount
- entry_type (debit/credit)

**maintenance_requests**
- id, account_id
- unit_id, tenant_id
- title, description
- priority (low, medium, high, emergency)
- status (new, in_progress, completed, cancelled)
- assigned_to (email or user)
- photos (jsonb)
- created_by_tenant (boolean)

**documents**
- id, account_id
- entity_type (unit, lease, tenant, maintenance)
- entity_id
- file_name, s3_key, mime_type
- uploaded_by

**form_letter_templates**
- id, account_id
- name (Late Notice, Eviction Warning, etc.)
- subject, body (html or markdown)
- variables (jsonb)

**reminder_rules**
- id, account_id
- event_type (rent_due, lease_expiring, maintenance_due)
- days_before
- template_id
- is_active