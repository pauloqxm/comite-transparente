import os
from dotenv import load_dotenv

# Carrega .env em desenvolvimento local (no Railway as vars já existem no ambiente)
load_dotenv()

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from routers import geojson, dados

app = FastAPI(title="Portal Comitê Banabuiú", version="2.0.0")

app.include_router(geojson.router, prefix="/api/geojson", tags=["geojson"])
app.include_router(dados.router,   prefix="/api/dados",   tags=["dados"])

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(os.path.join("static", "index.html"))


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    return FileResponse(os.path.join("static", "index.html"))
