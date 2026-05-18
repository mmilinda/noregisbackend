import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

load_dotenv()

# ── DB LIFESPAN ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🟢 Démarrage du lifespan...")
    try:
        from config.database import connect_db
        await connect_db()
        print("✅ Database connectée")
    except Exception as e:
        print(f"❌ ERREUR DURANT LA CONNEXION DB : {e}")
        import traceback
        traceback.print_exc()
        raise
    yield
    print("🔴 Arrêt du lifespan...")

# ── FASTAPI APP ───────────────────────────
app = FastAPI(
    title="Registre Visiteurs API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS (très permissif pour le test) ───
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── STATIC ────────────────────────────────
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── ROUTES ────────────────────────────────
from routes import auth, visiteurs, visites, scan, search

app.include_router(auth.router, prefix="/api/auth")
app.include_router(visiteurs.router, prefix="/api/visiteurs")
app.include_router(visites.router, prefix="/api/visites")
app.include_router(scan.router, prefix="/api/scan")
app.include_router(search.router, prefix="/api/search")

# ── ROOT ──────────────────────────────────
@app.get("/")
async def root():
    return {"message": "API OK", "version": "1.0.0"}

# ── ERROR HANDLER (facultatif) ─────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": str(exc)},
    )