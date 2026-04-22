from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from services.geojson_service import load_layer, available_layers

router = APIRouter()


@router.get("/layers")
async def list_layers():
    return {"layers": available_layers()}


@router.get("/{layer}")
async def get_layer(layer: str):
    data = load_layer(layer)
    if not data:
        raise HTTPException(status_code=404, detail=f"Camada '{layer}' não encontrada ou vazia.")
    return JSONResponse(content=data)
