import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from socketio import ASGIApp

load_dotenv()

# ── SOCKET.IO ─────────────────────────────────────────────────────────────────
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")

@sio.event
async def connect(sid, environ):
    print(f"🟢 Socket connecté : {sid}")

@sio.event
async def disconnect(sid):
    print(f"🔴 Socket déconnecté : {sid}")


# ── DB LIFESPAN ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    from config.database import connect_db
    await connect_db()
    yield


# ── FASTAPI APP ───────────────────────────────────────────────────────────────
fastapi_app = FastAPI(
    title="Registre Visiteurs API",
    version="1.0.0",
    lifespan=lifespan,
)

fastapi_app.state.sio = sio

# ── CORS ─────────────────────────────────────────────────────────────────────
# ✅ Accepte le frontend Vercel + localhost en dev
ORIGINS = [
    "https://noregis.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
]

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── STATIC FILES ──────────────────────────────────────────────────────────────
os.makedirs("uploads", exist_ok=True)
fastapi_app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── ROUTES ────────────────────────────────────────────────────────────────────
from routes import auth, visiteurs, visites, scan, search

fastapi_app.include_router(auth.router,      prefix="/api/auth")
fastapi_app.include_router(visiteurs.router, prefix="/api/visiteurs")
fastapi_app.include_router(visites.router,   prefix="/api/visites")
fastapi_app.include_router(scan.router,      prefix="/api/scan")
fastapi_app.include_router(search.router,    prefix="/api/search")


# ── ROOT ──────────────────────────────────────────────────────────────────────
@fastapi_app.get("/")
async def root():
    return {"message": "Registre Visiteurs API — OK", "version": "1.0.0"}


# ── GLOBAL ERROR HANDLER ──────────────────────────────────────────────────────
@fastapi_app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": str(exc)},
    )


# ── APP ASGI FINALE ───────────────────────────────────────────────────────────
# ✅ Renommé en `app` pour que Render/uvicorn le détecte correctement
app = ASGIApp(sio, other_asgi_app=fastapi_app)


# ── DÉMARRAGE DIRECT ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)