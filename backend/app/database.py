import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Engine and session are created here but not connected until DATABASE_URL is set.
# Replace the placeholder in .env with a real PostgreSQL connection string to activate.
engine = create_engine(DATABASE_URL) if DATABASE_URL else None
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None

Base = declarative_base()


def get_db():
    """Dependency that yields a database session. Requires DATABASE_URL to be set."""
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured. Set it in your .env file.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
