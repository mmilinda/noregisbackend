import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

load_dotenv()

# ── SOCKET.IO ─────────────────────────────
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")

@sio.event
async def connect(sid, environ):
    print(f"🟢 Socket connecté : {sid}")

@sio.event
async def disconnect(sid):
    print(f"🔴 Socket déconnecté : {sid}")


# ── DB LIFESPAN ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    from config.database import connect_db
    await connect_db()
    yield


# ── FASTAPI APP ───────────────────────────
app = FastAPI(
    title="Registre Visiteurs API",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.sio = sio


# ── CORS ──────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


# ── ERROR HANDLER ─────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": str(exc)},
    )


# ── SOCKET WRAPPER (IMPORTANT FIX) ────────
# 👉 ceci remplace socketio.ASGIApp proprement
from socketio import ASGIApp

socket_app = ASGIApp(sio, other_asgi_app=app)