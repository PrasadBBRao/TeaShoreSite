"""
reset_admin_password.py — Reset the password for the Teashore head_admin account.

Targets only the existing 'Prashanth' account. Verifies the account exists,
is active, and has role 'head_admin' before touching anything.

Safety rules:
  - Password read via getpass() — never echoed to the terminal.
  - Password and hash are never printed, logged, or written to disk.
  - Only password_hash is updated — no other column or table is touched.
  - Transaction is rolled back on any error.
  - Verifies the commit succeeded by re-reading the row after update.

Run once, then delete this file.
"""

import getpass
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the same directory as this script (backend root)
load_dotenv(Path(__file__).parent / ".env")

from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.models import Admin
from app.core.security import hash_password

TARGET_USERNAME  = "Prashanth"
TARGET_ROLE      = "head_admin"
MIN_PASSWORD_LEN = 12


def main() -> None:
    print()
    print("=" * 55)
    print("  Teashore — Head Admin Password Reset")
    print("=" * 55)
    print()

    # ── 1. Open session and locate the account ────────────────────────
    db = SessionLocal()
    try:
        admin = db.query(Admin).filter(Admin.username == TARGET_USERNAME).first()
    except SQLAlchemyError as exc:
        db.close()
        print(f"ERROR: Could not query the database.\n  {exc}")
        sys.exit(1)

    if admin is None:
        db.close()
        print(f"ERROR: No account found with username '{TARGET_USERNAME}'.")
        print("       Nothing was changed.")
        sys.exit(1)

    # ── 2. Verify account state ───────────────────────────────────────
    if admin.role != TARGET_ROLE:
        db.close()
        print(f"ERROR: Account '{TARGET_USERNAME}' has role '{admin.role}', "
              f"expected '{TARGET_ROLE}'.")
        print("       Nothing was changed.")
        sys.exit(1)

    if not admin.is_active:
        db.close()
        print(f"ERROR: Account '{TARGET_USERNAME}' is deactivated.")
        print("       Reactivate it via the admin panel before resetting the password.")
        sys.exit(1)

    # ── 3. Show safe confirmation ─────────────────────────────────────
    print(f"  Account found:")
    print(f"    Username : {admin.username}")
    print(f"    Role     : {admin.role}")
    print(f"    Active   : Yes")
    print()

    try:
        proceed = input("Reset password for this account? [y/N]: ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        db.close()
        print("\nAborted. Nothing was changed.")
        sys.exit(0)

    if proceed != "y":
        db.close()
        print("Aborted. Nothing was changed.")
        sys.exit(0)

    # ── 4. Collect new password (hidden, confirmed) ───────────────────
    print(f"\nPassword requirements: {MIN_PASSWORD_LEN}–128 characters.")

    try:
        password = getpass.getpass("Enter new password: ")
    except (KeyboardInterrupt, EOFError):
        db.close()
        print("\nAborted. Nothing was changed.")
        sys.exit(0)

    if len(password) < MIN_PASSWORD_LEN:
        db.close()
        print(f"ERROR: Password must be at least {MIN_PASSWORD_LEN} characters. "
              "Nothing was changed.")
        sys.exit(1)

    if len(password) > 128:
        db.close()
        print("ERROR: Password must be 128 characters or fewer. Nothing was changed.")
        sys.exit(1)

    try:
        confirm = getpass.getpass("Confirm new password: ")
    except (KeyboardInterrupt, EOFError):
        password = None
        db.close()
        print("\nAborted. Nothing was changed.")
        sys.exit(0)

    if password != confirm:
        password = confirm = None  # noqa: F841
        db.close()
        print("ERROR: Passwords do not match. Nothing was changed.")
        sys.exit(1)

    # ── 5. Hash, update, commit ───────────────────────────────────────
    try:
        hashed = hash_password(password)
    finally:
        password = confirm = None  # noqa: F841 — clear plaintext immediately

    try:
        admin.password_hash = hashed
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        db.close()
        hashed = None  # noqa: F841
        print(f"ERROR: Database update failed. Transaction rolled back.\n  {exc}")
        sys.exit(1)
    finally:
        hashed = None  # noqa: F841 — clear hash reference regardless of outcome

    # ── 6. Verify the commit by re-reading the row ────────────────────
    try:
        db.expire(admin)   # force a fresh SELECT on next access
        db.refresh(admin)
        committed_role     = admin.role
        committed_active   = admin.is_active
        committed_username = admin.username
    except SQLAlchemyError as exc:
        db.close()
        print(f"WARNING: Update was sent but post-commit verification failed.\n  {exc}")
        print("         Check the database manually before logging in.")
        sys.exit(1)

    db.close()

    if committed_username != TARGET_USERNAME or committed_role != TARGET_ROLE:
        print("ERROR: Post-commit verification returned unexpected data. "
              "Check the database manually.")
        sys.exit(1)

    # ── 7. Success ────────────────────────────────────────────────────
    print()
    print("=" * 55)
    print("  Password updated and committed successfully.")
    print("=" * 55)
    print(f"  Username : {committed_username}")
    print(f"  Role     : {committed_role}")
    print(f"  Active   : {'Yes' if committed_active else 'No'}")
    print()
    print("Next steps:")
    print("  1. Log in at /admin/login with your new password.")
    print("  2. Store the password in a password manager.")
    print("  3. Delete this script:  del reset_admin_password.py")
    print()


if __name__ == "__main__":
    main()
