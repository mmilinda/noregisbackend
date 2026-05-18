import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

load_dotenv()

# ── Socket.IO ─────────────────────────────────────────────────────────────────
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")


@sio.event
async def connect(sid, environ):
    print(f"🟢 Socket connecté : {sid}")


@sio.event
async def disconnect(sid):
    print(f"🔴 Socket déconnecté : {sid}")


# ── Lifespan (démarrage / arrêt) ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    from config.database import connect_db
    await connect_db()
    yield


# ── Application FastAPI ───────────────────────────────────────────────────────
fastapi_app = FastAPI(
    title="Registre Visiteurs API",
    version="1.0.0",
    lifespan=lifespan,
)

fastapi_app.state.sio = sio

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
fastapi_app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── Routes ────────────────────────────────────────────────────────────────────
from routes import auth, visiteurs, visites, scan, search  # noqa: E402

fastapi_app.include_router(auth.router,      prefix="/api/auth")
fastapi_app.include_router(visiteurs.router, prefix="/api/visiteurs")
fastapi_app.include_router(visites.router,   prefix="/api/visites")
fastapi_app.include_router(scan.router,      prefix="/api/scan")
fastapi_app.include_router(search.router,    prefix="/api/search")


@fastapi_app.get("/")
async def root():
    return {"message": "Registre Visiteurs API — OK", "version": "1.0.0"}


# ── Gestionnaire d'erreurs global ─────────────────────────────────────────────
@fastapi_app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": str(exc)},
    )


# ── App ASGI finale (FastAPI + Socket.IO) ─────────────────────────────────────
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)

# ── Démarrage direct ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
