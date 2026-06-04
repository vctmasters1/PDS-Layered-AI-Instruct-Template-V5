#!/usr/bin/env python3
"""
Database Schema Generator — Central Controller for Migration Creation

Enforces table naming (tbl_*), column naming (col_*), and standard columns at creation time.
Generates migration files following YYYYMMDDHHMMSS_{description}.sql convention.

Usage:
    python schema_generator.py --table users --fields id,email,first_name --verbose
    python schema_generator.py --table products --action create --indices email
    python schema_generator.py --list-columns users
    python schema_generator.py --validate tbl_user
    python schema_generator.py --find-conflicts --table users
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path


# Standard column templates
STANDARD_COLUMNS = {
    "id": "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),",
    "created_at_utc": "  col_created_at_utc TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,",
    "updated_at_utc": "  col_updated_at_utc TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,",
    "deleted_at_utc": "  col_deleted_at_utc TIMESTAMP NULL DEFAULT NULL,",
}

# Column type map
COLUMN_TYPES = {
    "uuid": "UUID",
    "string": "VARCHAR(255)",
    "text": "TEXT",
    "integer": "INTEGER",
    "bigint": "BIGINT",
    "decimal": "DECIMAL(10, 2)",
    "boolean": "BOOLEAN",
    "timestamp": "TIMESTAMP",
    "jsonb": "JSONB",
}

# Table prefix registry
TABLE_PREFIX = "tbl_"
COLUMN_PREFIX = "col_"
INDEX_PREFIX = "idx_"
FK_PREFIX = "fk_"


class SchemaGenerator:
    """Central schema generator enforcing naming conventions."""

    def __init__(self, verbose=False):
        self.verbose = verbose
        self.migrations_dir = Path("./migrations")
        self.migrations_dir.mkdir(exist_ok=True)

    def normalize_name(self, name):
        """Normalize name to snake_case."""
        return name.lower().replace(" ", "_").replace("-", "_")

    def generate_table_name(self, resource):
        """Generate table name from resource."""
        normalized = self.normalize_name(resource)
        table_name = f"{TABLE_PREFIX}{normalized}"

        if self.verbose:
            print(f"   ✓ Resource: {resource}")
            print(f"   ✓ Generated table name: {table_name}")

        return table_name

    def generate_column_name(self, field, col_type="string"):
        """Generate column name from field."""
        normalized = self.normalize_name(field)
        col_name = f"{COLUMN_PREFIX}{normalized}"

        if self.verbose:
            print(f"      ✓ Field '{field}' → {col_name} ({COLUMN_TYPES.get(col_type, col_type)})")

        return col_name

    def generate_index_name(self, table, columns):
        """Generate index name."""
        col_list = "_".join([self.normalize_name(c) for c in columns])
        index_name = f"{INDEX_PREFIX}{self.normalize_name(table)}_{col_list}"
        return index_name

    def validate_table_name(self, table_name):
        """Validate table name format."""
        if not table_name.startswith(TABLE_PREFIX):
            return False, f"Table must start with '{TABLE_PREFIX}' prefix"
        if not table_name.islower() and "_" in table_name:
            return False, "Table name must be lowercase with underscores"
        return True, None

    def find_conflicts(self, table_name):
        """Check if table already exists in migrations."""
        conflicts = []
        for migration_file in self.migrations_dir.glob("*.sql"):
            content = migration_file.read_text()
            if f"CREATE TABLE {table_name}" in content:
                conflicts.append(migration_file.name)

        if conflicts:
            return False, f"Table '{table_name}' already defined in: {', '.join(conflicts)}"
        return True, None

    def generate_migration_file(self, table, fields, indices=None, verbose=False):
        """Generate a migration file."""
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        description = f"create_{table}".replace(TABLE_PREFIX, "")
        filename = f"{timestamp}_{description}.sql"
        filepath = self.migrations_dir / filename

        # Validate table
        valid, error = self.validate_table_name(table)
        if not valid:
            return False, error

        # Check conflicts
        exists, error = self.find_conflicts(table)
        if not exists:
            return False, error

        # Build migration
        lines = ["-- UP: Create table", f"CREATE TABLE {table} ("]
        lines.append(STANDARD_COLUMNS["id"])

        # Add user-provided fields
        for field in fields:
            parts = field.split(":")
            field_name = parts[0]
            field_type = parts[1] if len(parts) > 1 else "string"

            col_name = self.generate_column_name(field_name, field_type)
            col_type = COLUMN_TYPES.get(field_type, field_type)
            lines.append(f"  {col_name} {col_type},")

        # Add standard columns
        lines.append(STANDARD_COLUMNS["created_at_utc"])
        lines.append(STANDARD_COLUMNS["updated_at_utc"])
        lines.append(STANDARD_COLUMNS["deleted_at_utc"].rstrip(","))  # Remove trailing comma from last

        lines.append(");")

        # Add indices
        lines.append("")
        lines.append(f"CREATE INDEX {INDEX_PREFIX}{table.replace(TABLE_PREFIX, '')}_col_id ON {table}(id);")
        lines.append(f"CREATE INDEX {INDEX_PREFIX}{table.replace(TABLE_PREFIX, '')}_col_created_at ON {table}(col_created_at_utc);")

        if indices:
            for idx_field in indices:
                col_name = self.generate_column_name(idx_field)
                idx_name = self.generate_index_name(table, [idx_field])
                lines.append(f"CREATE INDEX {idx_name} ON {table}({col_name});")

        # Add DOWN
        lines.append("")
        lines.append("-- DOWN: Drop table")
        lines.append(f"DROP TABLE IF EXISTS {table} CASCADE;")

        # Write file
        filepath.write_text("\n".join(lines) + "\n")

        if verbose:
            print(f"\n✓ Migration created: {filepath}")
            print(f"  Timestamp: {timestamp}")
            print(f"  Table: {table}")
            print(f"  Fields: {len(fields)} + 4 standard columns")

        return True, filepath

    def list_types(self):
        """List available column types."""
        print("\n" + "=" * 70)
        print("AVAILABLE COLUMN TYPES")
        print("=" * 70)
        for col_type, sql_type in COLUMN_TYPES.items():
            print(f"  {col_type:<15} → {sql_type}")
        print()

    def validate(self, table_name):
        """Validate a table name."""
        valid, error = self.validate_table_name(table_name)
        if valid:
            exists, conflict_error = self.find_conflicts(table_name)
            if exists:
                print(f"✓ Table name '{table_name}' is valid and unique")
                return True
            else:
                print(f"✗ {conflict_error}")
                return False
        else:
            print(f"✗ {error}")
            return False


def main():
    parser = argparse.ArgumentParser(
        description="Database Schema Generator — Central Controller for Migrations"
    )

    # Commands
    parser.add_argument(
        "--table",
        type=str,
        help="Table name (resource, e.g., 'users' → 'tbl_users')"
    )
    parser.add_argument(
        "--fields",
        type=str,
        help="Comma-separated fields with optional types: id,email:string,score:integer"
    )
    parser.add_argument(
        "--indices",
        type=str,
        help="Comma-separated fields to index: email,created_at"
    )
    parser.add_argument(
        "--list-types",
        action="store_true",
        help="List available column types"
    )
    parser.add_argument(
        "--validate",
        type=str,
        help="Validate a table name"
    )
    parser.add_argument(
        "--find-conflicts",
        action="store_true",
        help="Check if table already exists (use with --table)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()
    generator = SchemaGenerator(verbose=args.verbose)

    # Handle commands
    if args.list_types:
        generator.list_types()
        return 0

    if args.validate:
        valid = generator.validate(args.validate)
        return 0 if valid else 1

    if args.table:
        table_name = generator.generate_table_name(args.table)

        if args.find_conflicts:
            exists, error = generator.find_conflicts(table_name)
            if exists:
                print(f"✓ No conflicts found for '{table_name}'")
            else:
                print(f"✗ {error}")
            return 0 if exists else 1

        # Generate migration
        if args.fields:
            fields = [f.strip() for f in args.fields.split(",")]
            indices = [i.strip() for i in args.indices.split(",")] if args.indices else None

            success, result = generator.generate_migration_file(
                table_name,
                fields,
                indices,
                verbose=True
            )

            if success:
                print("\n" + "=" * 70)
                print("MIGRATION GENERATED")
                print("=" * 70)
                print(f"File: {result}")
                print("\nNext steps:")
                print("  1. Review the migration file")
                print("  2. Run migrations with your tool (migrate up)")
                print("  3. Scan schema with: python db/schema_discovery.py")
                print("  4. Validate with: python db/schema_validator.py")
                print()
                return 0
            else:
                print(f"✗ Error: {result}")
                return 1
        else:
            print("✗ Please provide --fields for migration generation")
            return 1

    print("No command specified. Use --help for usage.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
