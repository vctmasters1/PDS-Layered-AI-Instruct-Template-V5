# Architecture & Project Structure

**Recommended Folder Structure**:
```
pds-property-portal/
├── .ai/
├── src/
│   ├── features/
│   │   ├── tenant-portal/
│   │   ├── dashboard/
│   │   ├── units/
│   │   ├── tenants/
│   │   ├── leases/
│   │   ├── maintenance/
│   │   ├── accounting/
│   │   ├── transactions/
│   │   ├── documents/
│   │   └── form-letters/
│   ├── components/ (shared)
│   ├── lib/api.ts (axios instance with account_id)
│   ├── hooks/
│   ├── store/ (Zustand for user + preferences)
│   └── types/
├── backend/ (if separate)
└── package.json
```

**State Management**: Zustand (lightweight) + TanStack Query for server state.

**Routing**: React Router with protected routes + tenant vs owner role-based views.