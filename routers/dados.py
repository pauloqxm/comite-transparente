import math
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from services import sheets

router = APIRouter()


def _df_to_records(df):
    """Converte DataFrame para lista de dicts, substituindo NaN por None."""
    records = df.where(df.notna(), other=None).to_dict(orient="records")
    def clean(v):
        if isinstance(v, float) and math.isnan(v):
            return None
        return v
    return [{k: clean(v) for k, v in row.items()} for row in records]


def _safe_date(val):
    try:
        return val.strftime("%Y-%m-%d") if not hasattr(val, "year") is False and val is not None else str(val)
    except Exception:
        return str(val)


# ─── Vazões ───────────────────────────────────────────────────────────────────

@router.get("/vazoes")
async def get_vazoes(
    reservatorio: list[str] = Query(default=[]),
    operacao: list[str] = Query(default=[]),
    data_inicio: str | None = None,
    data_fim: str | None = None,
    unidade: str = "Ls",
):
    import pandas as pd
    df = sheets.load_vazoes()
    if df.empty:
        return JSONResponse(content={"data": [], "error": "Sem dados"})

    if reservatorio:
        df = df[df["Reservatório Monitorado"].isin(reservatorio)]
    if operacao:
        df = df[df["Operação"].isin(operacao)]
    if data_inicio:
        df = df[df["Data"] >= pd.to_datetime(data_inicio, errors="coerce")]
    if data_fim:
        df = df[df["Data"] <= pd.to_datetime(data_fim, errors="coerce")]

    if unidade == "m3s" and "Vazão Operada" in df.columns:
        df = df.copy()
        df["Vazão Operada"] = pd.to_numeric(df["Vazão Operada"], errors="coerce") / 1000.0

    df["Data"] = df["Data"].dt.strftime("%Y-%m-%d")

    reservatorios_list = df["Reservatório Monitorado"].dropna().unique().tolist() if "Reservatório Monitorado" in df.columns else []
    operacoes_list     = df["Operação"].dropna().unique().tolist() if "Operação" in df.columns else []
    meses_list         = df["Mês"].dropna().unique().tolist() if "Mês" in df.columns else []

    return {
        "data": _df_to_records(df),
        "meta": {
            "reservatorios": sorted(reservatorios_list),
            "operacoes": sorted(operacoes_list),
            "meses": sorted(meses_list),
            "unidade": "m³/s" if unidade == "m3s" else "L/s",
        },
    }


# ─── Açudes / Reservatórios ───────────────────────────────────────────────────

@router.get("/acudes")
async def get_acudes(
    reservatorio: list[str] = Query(default=[]),
    municipio: str | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    perc_min: float = 0.0,
    perc_max: float = 200.0,
):
    import pandas as pd
    df = sheets.load_reservatorios()
    if df.empty:
        return {"data": [], "meta": {}}

    if reservatorio:
        df = df[df["Reservatório"].astype(str).isin(reservatorio)]
    if municipio and municipio != "Todos":
        df = df[df["Município"].astype(str) == municipio]
    if data_inicio and "Data de Coleta" in df.columns:
        df = df[df["Data de Coleta"] >= pd.to_datetime(data_inicio, errors="coerce")]
    if data_fim and "Data de Coleta" in df.columns:
        df = df[df["Data de Coleta"] <= pd.to_datetime(data_fim, errors="coerce")]
    if "Percentual" in df.columns:
        df = df[df["Percentual"].between(perc_min, perc_max, inclusive="both")]

    df = df.copy()
    if "Data de Coleta" in df.columns:
        df["Data de Coleta"] = df["Data de Coleta"].dt.strftime("%Y-%m-%d")

    reservatorios_list = df["Reservatório"].dropna().unique().tolist() if "Reservatório" in df.columns else []
    municipios_list    = df["Município"].dropna().unique().tolist() if "Município" in df.columns else []
    datas_list         = df["Data de Coleta"].dropna().unique().tolist() if "Data de Coleta" in df.columns else []

    return {
        "data": _df_to_records(df),
        "meta": {
            "reservatorios": sorted(reservatorios_list),
            "municipios": sorted(municipios_list),
            "datas": sorted(datas_list),
            "perc_min": float(sheets.load_reservatorios()["Percentual"].min()) if "Percentual" in sheets.load_reservatorios().columns else 0,
            "perc_max": float(sheets.load_reservatorios()["Percentual"].max()) if "Percentual" in sheets.load_reservatorios().columns else 100,
        },
    }


# ─── Sedes / Simulações ───────────────────────────────────────────────────────

@router.get("/municipios")
async def get_municipios():
    df = sheets.load_simulacoes()
    if df.empty:
        return {"data": [], "meta": {}}
    df = df.copy()
    df["Data"] = df["Data"].dt.strftime("%Y-%m-%d")
    acudes_list  = df["Açude"].dropna().unique().tolist() if "Açude" in df.columns else []
    munic_list   = df["Município"].dropna().unique().tolist() if "Município" in df.columns else []
    regioes_list = df["Região Hidrográfica"].dropna().unique().tolist() if "Região Hidrográfica" in df.columns else []
    return {
        "data": _df_to_records(df),
        "meta": {
            "acudes": sorted(acudes_list),
            "municipios": sorted(munic_list),
            "regioes": sorted(regioes_list),
        },
    }


# ─── Comitê ───────────────────────────────────────────────────────────────────

@router.get("/comite")
async def get_comite():
    df = sheets.load_comite()
    if df.empty:
        return {"data": [], "meta": {}}
    segmentos_list = df["Segmento"].dropna().unique().tolist() if "Segmento" in df.columns else []
    municipios_list = df["Município"].dropna().unique().tolist() if "Município" in df.columns else []
    return {
        "data": _df_to_records(df),
        "meta": {
            "segmentos": sorted(segmentos_list),
            "municipios": sorted(municipios_list),
        },
    }


# ─── Documentos ───────────────────────────────────────────────────────────────

@router.get("/docs")
async def get_docs(
    operacao: list[str] = Query(default=[]),
    reservatorio: list[str] = Query(default=[]),
    busca: str = "",
):
    df = sheets.load_docs()
    if df.empty:
        return {"data": [], "meta": {}}
    if operacao and "Operação" in df.columns:
        df = df[df["Operação"].isin(operacao)]
    if reservatorio and "Reservatório/Sistema" in df.columns:
        df = df[df["Reservatório/Sistema"].isin(reservatorio)]
    if busca:
        mask = df.apply(lambda row: any(busca.lower() in str(v).lower() for v in row.values), axis=1)
        df = df[mask]
    ops_list  = sheets.load_docs()["Operação"].dropna().unique().tolist() if "Operação" in sheets.load_docs().columns else []
    res_list  = sheets.load_docs()["Reservatório/Sistema"].dropna().unique().tolist() if "Reservatório/Sistema" in sheets.load_docs().columns else []
    return {
        "data": _df_to_records(df),
        "meta": {
            "operacoes": sorted(ops_list),
            "reservatorios": sorted(res_list),
        },
    }


# ─── Publicações ──────────────────────────────────────────────────────────────

@router.get("/publicacoes")
async def get_publicacoes(categoria: str | None = None, busca: str = ""):
    df = sheets.load_publicacoes()
    if df.empty:
        return {"data": [], "meta": {}}
    if categoria:
        df = df[df["Categoria"].astype(str) == categoria]
    if busca:
        mask = df.apply(lambda row: any(busca.lower() in str(v).lower() for v in row.values), axis=1)
        df = df[mask]
    cats_list = sheets.load_publicacoes()["Categoria"].dropna().unique().tolist() if "Categoria" in sheets.load_publicacoes().columns else []
    return {
        "data": _df_to_records(df),
        "meta": {"categorias": sorted(cats_list)},
    }


# ─── Acompanhamento Diário ────────────────────────────────────────────────────

@router.get("/diario")
async def get_diario(
    reservatorio: list[str] = Query(default=[]),
    prev_date: str | None = None,
):
    df_raw = sheets.load_diario_raw()
    if df_raw.empty:
        return {"rows": [], "prev_label": "", "curr_label": "", "prev_options": [], "reservatorios": []}

    col_res = sheets.find_column(df_raw, {"reservatorio", "reservatório", "acude", "açude", "nome"})
    all_res = sorted(df_raw[col_res].dropna().unique().tolist()) if col_res else []

    result = sheets.compute_diario(df_raw, reservatorio or None, prev_date)
    result["reservatorios"] = all_res
    return result
