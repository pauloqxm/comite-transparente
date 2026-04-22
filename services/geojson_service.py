"""
Serviço de leitura e cache em memória dos ficheiros GeoJSON locais.
"""
import json
import os
from functools import lru_cache

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

LAYER_MAP: dict[str, str] = {
    "trechos":    "trechos_perene.geojson",
    "acudes":     "Açudes_Monitorados.geojson",
    "sedes":      "Sedes_Municipais.geojson",
    "gestoras":   "c_gestoras.geojson",
    "municipios": "poligno_municipios.geojson",
    "bacia":      "bacia_banabuiu.geojson",
    "controle":   "pontos_controle.geojson",
    "situa":      "situa_municipio.geojson",
}


@lru_cache(maxsize=None)
def load_layer(layer: str) -> dict:
    """Carrega e retorna um GeoJSON pelo alias de camada."""
    filename = LAYER_MAP.get(layer)
    if not filename:
        return {}
    filepath = os.path.normpath(os.path.join(DATA_DIR, filename))
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def available_layers() -> list[str]:
    return list(LAYER_MAP.keys())
