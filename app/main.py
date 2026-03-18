from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import crud
from app.database import Base, SessionLocal, engine
from app.routes import api, auth, pages

Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    crud.seed_default_staff_user(db)
    crud.seed_demo_customers_bulk(db)
finally:
    db.close()

app = FastAPI(title="SecureBank Core System")
app.add_middleware(SessionMiddleware, secret_key="securebank-dev-secret-key")

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(pages.router)
app.include_router(auth.router)
app.include_router(api.router)