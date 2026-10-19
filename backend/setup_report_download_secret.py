"""Generate a bcrypt hash for REPORT_DOWNLOAD_SECRET_HASH.

Run from backend/ with the normal server environment configured:
    python setup_report_download_secret.py

The plaintext is read without echo, never written to disk, and never printed.
Configure only the resulting hash in the backend secret store.
"""

from getpass import getpass

from app.core.security import hash_password


def main() -> None:
    secret = getpass("New report-download secret (16-72 UTF-8 bytes): ")
    confirmation = getpass("Confirm report-download secret: ")
    secret_bytes = secret.encode("utf-8")
    if secret != confirmation:
        raise SystemExit("Secrets did not match.")
    if not 16 <= len(secret_bytes) <= 72:
        raise SystemExit("Secret must be between 16 and 72 UTF-8 bytes.")

    print("Configure this value as REPORT_DOWNLOAD_SECRET_HASH on the backend:")
    print(hash_password(secret))


if __name__ == "__main__":
    main()