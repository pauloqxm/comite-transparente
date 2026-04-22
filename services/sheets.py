"""
Serviço de leitura de dados do Google Sheets via exportação CSV.
Usa cache em memória com TTL simples para evitar re-fetch frequente.
"""
import math
import time
import unicodedata
from functools import wraps
from typing import Any

import pandas as pd

_cache: dict[str, tuple[float, Any]] = {}


def _ttl_cache(ttl_seconds: int):
    """Decorador de cache com TTL para funções sem argumentos."""
    def decorator(fn):
        @wraps(fn)
        def wrapper():
            now = time.monotonic()
            key = fn.__name__
            if key in _cache:
                ts, val = _cache[key]
                if now - ts < ttl_seconds:
                    return val
            val = fn()
            _cache[key] = (now, val)
            return val
        return wrapper
    return decorator


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _gsheet_edit_to_csv(url: str) -> str:
    """Converte URL de edição do Google Sheets para URL de exportação CSV."""
    import re
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", url or "")
    gid_m = re.search(r"[#?&]gid=(\d+)", url or "")
    if not m:
        return url
    base = f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv"
    if gid_m:
        base += f"&gid={gid_m.group(1)}"
    return base


def strip_accents_lower(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    ).lower()


def to_number(x) -> float:
    if x is None:
        return math.nan
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    if s in ("", "nan", "none", "null", "-"):
        return math.nan
    s = "".join(ch for ch in s if ch.isdigit() or ch in ".,-")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    try:
        return float(s)
    except Exception:
        return math.nan


# ─────────────────────────────────────────────
# Vazões
# ─────────────────────────────────────────────
VAZOES_URL = "https://docs.google.com/spreadsheets/d/1pbNcZ9hS8DhotdkYuPc8kIOy5dgyoYQb384-jgqLDfA/export?format=csv"


@_ttl_cache(ttl_seconds=300)
def load_vazoes() -> pd.DataFrame:
    try:
        df = pd.read_csv(VAZOES_URL)
        df["Data"] = pd.to_datetime(df["Data"], format="%d/%m/%Y", errors="coerce")
        df["Mês"] = df["Data"].dt.to_period("M").astype(str)
        return df
    except Exception:
        return pd.DataFrame()


# ─────────────────────────────────────────────
# Reservatórios / Açudes
# ─────────────────────────────────────────────
RESERVATORIOS_URL = "https://docs.google.com/spreadsheets/d/1zZ0RCyYj-AzA_dhWzxRziDWjgforbaH7WIoSEd2EKdk/export?format=csv"


@_ttl_cache(ttl_seconds=3600)
def load_reservatorios() -> pd.DataFrame:
    try:
        df = pd.read_csv(RESERVATORIOS_URL)
        if {"Latitude", "Longitude"} <= set(df.columns):
            df["Latitude"] = pd.to_numeric(
                df["Latitude"].astype(str).str.replace(",", "."), errors="coerce"
            )
            df["Longitude"] = pd.to_numeric(
                df["Longitude"].astype(str).str.replace(",", "."), errors="coerce"
            )
            df = df.dropna(subset=["Latitude", "Longitude"])
        if "Data de Coleta" in df.columns:
            df["Data de Coleta"] = pd.to_datetime(df["Data de Coleta"], errors="coerce", dayfirst=True)
            df = df.dropna(subset=["Data de Coleta"])
        for col in ("Percentual", "Volume", "Cota Sangria", "Nivel"):
            if col in df.columns:
                df[col] = pd.to_numeric(
                    df[col].astype(str).str.replace(",", ".").str.replace("%", "").str.strip(),
                    errors="coerce",
                )
        return df
    except Exception:
        return pd.DataFrame()


# ─────────────────────────────────────────────
# Documentos / Atas
# ─────────────────────────────────────────────
DOCS_URL = "https://docs.google.com/spreadsheets/d/1-Tn_ZDHH-mNgJAY1WtjWd_Pyd2f5kv_ZU8dhL0caGDI/export?format=csv&gid=0"


@_ttl_cache(ttl_seconds=3600)
def load_docs() -> pd.DataFrame:
    try:
        df = pd.read_csv(DOCS_URL, encoding="utf-8-sig").dropna(how="all")
        for col in ("Operação", "Data da Reunião", "Reservatório/Sistema", "Local da Reunião", "Parâmetros aprovados", "Vazão média"):
            if col in df.columns:
                df[col] = df[col].fillna("").astype(str)
        return df
    except Exception:
        return pd.DataFrame()


# ─────────────────────────────────────────────
# Simulações / Sedes Municipais
# ─────────────────────────────────────────────
SIMULACOES_URL = "https://docs.google.com/spreadsheets/d/1C40uaNmLUeu-k_FGEPZOgF8FwpSU00C9PtQu8Co4AUI/export?format=csv"


@_ttl_cache(ttl_seconds=3600)
def load_simulacoes() -> pd.DataFrame:
    try:
        df = pd.read_csv(SIMULACOES_URL, sep=",", decimal=",")
        colunas = [
            "Data", "Açude", "Município", "Região Hidrográfica",
            "Cota Inicial (m)", "Cota Dia (m)", "Volume (m³)", "Volume (%)",
            "Evapor. Parcial (mm)", "Cota Interm. (m)", "Volume Interm. (m³)",
            "Liberação (m³/s)", "Liberação (m³)", "Volume Final (m³)", "Cota Final (m)", "Coordendas",
        ]
        faltantes = [c for c in colunas if c not in df.columns]
        if faltantes:
            return pd.DataFrame()
        df = df[colunas].copy()
        df["Data"] = pd.to_datetime(df["Data"].astype(str).str.strip(), dayfirst=True, errors="coerce")
        df = df.dropna(subset=["Data"])
        for col in ("Cota Inicial (m)", "Cota Dia (m)", "Volume (m³)", "Volume (%)", "Evapor. Parcial (mm)"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
        return df
    except Exception:
        return pd.DataFrame()


# ─────────────────────────────────────────────
# Comitê – Representantes
# ─────────────────────────────────────────────
COMITE_URL = "https://docs.google.com/spreadsheets/d/14Hb7N5yq4u-B3JN8Stpvpbdlt3sL0JxWUYpJK4fzLV8/export?format=csv&gid=1572572584"


@_ttl_cache(ttl_seconds=3600)
def load_comite() -> pd.DataFrame:
    try:
        df = pd.read_csv(COMITE_URL, dtype=str)
        df.columns = [c.strip() for c in df.columns]
        for c in df.columns:
            df[c] = df[c].astype(str).str.strip()
        for col in ("Inicio do mandato", "Fim do mandato"):
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors="coerce", dayfirst=True).astype(str)
        if "Coordenadas" in df.columns:
            coords = (
                df["Coordenadas"].astype(str).str.strip()
                .str.replace(";", ",", regex=False)
                .str.replace(r"[()\\[\\]]", "", regex=True)
            )
            parts = coords.str.split(",", n=1, expand=True)
            if parts.shape[1] == 2:
                df["Latitude"] = pd.to_numeric(parts[0].str.replace(" ", ""), errors="coerce")
                df["Longitude"] = pd.to_numeric(parts[1].str.replace(" ", ""), errors="coerce")
        if "Nome do(a) representante" in df.columns:
            def dois_primeiros(nm: str) -> str:
                ps = [p for p in (nm or "").split() if p]
                return " ".join(ps[:2]) if ps else nm
            df["Nome (2)"] = df["Nome do(a) representante"].apply(dois_primeiros)
        return df
    except Exception:
        return pd.DataFrame()


# ─────────────────────────────────────────────
# Publicações
# ─────────────────────────────────────────────
PUBLICACOES_URL = "https://docs.google.com/spreadsheets/d/1A9Ibbij0aDUbFzVdqyl1FmGAbulFnylOHeU_qFdpjgs/export?format=csv&gid=0"


@_ttl_cache(ttl_seconds=600)
def load_publicacoes() -> pd.DataFrame:
    try:
        df = pd.read_csv(PUBLICACOES_URL, dtype="string").fillna("")
        expected = ["Capa_link", "Título", "Ano da Publicação", "Categoria", "Resumo", "Link"]
        df.columns = [str(c).strip() for c in df.columns]
        for col in expected:
            if col not in df.columns:
                df[col] = ""
        return df[expected]
    except Exception:
        return pd.DataFrame()


# ─────────────────────────────────────────────
# Acompanhamento Diário
# ─────────────────────────────────────────────
DIARIO_URL = "https://docs.google.com/spreadsheets/d/1zZ0RCyYj-AzA_dhWzxRziDWjgforbaH7WIoSEd2EKdk/export?format=csv&gid=1305065127"


def find_column(df: pd.DataFrame, aliases: set) -> str | None:
    normalized = {col: strip_accents_lower(col) for col in df.columns}
    for col, norm in normalized.items():
        if norm in aliases:
            return col
    for col, norm in normalized.items():
        if any(alias in norm for alias in aliases):
            return col
    return None


@_ttl_cache(ttl_seconds=900)
def load_diario_raw() -> pd.DataFrame:
    try:
        df = pd.read_csv(DIARIO_URL, dtype=str)
        df.columns = [c.strip() for c in df.columns]
        return df
    except Exception:
        return pd.DataFrame()


def compute_diario(df_raw: pd.DataFrame, reservatorios: list[str] | None = None, prev_date: str | None = None) -> dict:
    """Processa os dados diários e retorna dict com tabela e metadados."""
    if df_raw.empty:
        return {"rows": [], "prev_label": "", "curr_label": "", "prev_options": []}

    col_res   = find_column(df_raw, {"reservatorio", "reservatório", "acude", "açude", "nome"})
    col_cs    = find_column(df_raw, {"cota sangria", "cota de sangria", "cota_sangria", "cota excedencia"})
    col_data  = find_column(df_raw, {"data", "dt", "dia"})
    col_vol   = find_column(df_raw, {"volume", "vol"})
    col_perc  = find_column(df_raw, {"percentual", "perc", "percentual (%)", "volume (%)"})
    col_nivel = find_column(df_raw, {"nivel", "nível", "cota", "altura"})

    required = {"Reservatório": col_res, "Cota Sangria": col_cs, "Data": col_data,
                "Volume": col_vol, "Percentual": col_perc, "Nivel": col_nivel}
    missing = [k for k, v in required.items() if v is None]
    if missing:
        return {"rows": [], "prev_label": "", "curr_label": "", "prev_options": [], "error": f"Colunas não encontradas: {missing}"}

    df = df_raw.copy()
    df[col_data]  = pd.to_datetime(df[col_data], dayfirst=True, errors="coerce")
    df[col_vol]   = df[col_vol].apply(to_number)
    df[col_perc]  = df[col_perc].apply(to_number)
    df[col_nivel] = df[col_nivel].apply(to_number)
    df[col_cs]    = df[col_cs].apply(to_number)
    df = df.dropna(subset=[col_data])

    if reservatorios:
        df = df[df[col_res].isin(reservatorios)]

    unique_dates = sorted(pd.Series(df[col_data].dropna().unique()).dropna().tolist())
    if not unique_dates:
        return {"rows": [], "prev_label": "", "curr_label": "", "prev_options": []}

    data_atual = unique_dates[-1]
    prev_candidates = [d for d in unique_dates if d < data_atual]

    if prev_date:
        try:
            forced = pd.to_datetime(prev_date, errors="coerce")
            data_anterior = forced if forced in prev_candidates else (prev_candidates[-1] if prev_candidates else None)
        except Exception:
            data_anterior = prev_candidates[-1] if prev_candidates else None
    else:
        data_anterior = prev_candidates[-1] if prev_candidates else None

    def last_on_date(dfr, target):
        if target is None or pd.isna(target):
            return math.nan
        sel = dfr.loc[pd.to_datetime(dfr[col_data], errors="coerce").dt.normalize() == pd.Timestamp(target).normalize(), col_nivel]
        sel = pd.to_numeric(sel, errors="coerce").dropna()
        return float(sel.iloc[-1]) if not sel.empty else math.nan

    def last_vol_on_date(dfr, target):
        if target is None or pd.isna(target):
            return math.nan
        sel = dfr.loc[pd.to_datetime(dfr[col_data], errors="coerce").dt.normalize() == pd.Timestamp(target).normalize(), col_vol]
        sel = pd.to_numeric(sel, errors="coerce").dropna()
        return float(sel.iloc[-1]) if not sel.empty else math.nan

    rows = []
    for res, dfr in df.groupby(col_res, dropna=True):
        nivel_atual    = last_on_date(dfr, data_atual)
        nivel_anterior = last_on_date(dfr, data_anterior)
        vol_atual      = last_vol_on_date(dfr, data_atual)
        vol_anterior   = last_vol_on_date(dfr, data_anterior)
        sel_perc = dfr.loc[pd.to_datetime(dfr[col_data], errors="coerce").dt.normalize() == pd.Timestamp(data_atual).normalize(), col_perc]
        perc_atual = float(pd.to_numeric(sel_perc, errors="coerce").dropna().iloc[-1]) if not pd.to_numeric(sel_perc, errors="coerce").dropna().empty else math.nan

        cap_total = (vol_atual / (perc_atual / 100.0)) if (not math.isnan(vol_atual) and not math.isnan(perc_atual) and perc_atual != 0) else math.nan
        var_nivel  = (nivel_atual - nivel_anterior) if (not math.isnan(nivel_atual) and not math.isnan(nivel_anterior)) else math.nan
        var_volume = (vol_atual - vol_anterior) if (not math.isnan(vol_atual) and not math.isnan(vol_anterior)) else math.nan

        sel_cs = pd.to_numeric(dfr[col_cs], errors="coerce").dropna()
        cota_s = float(sel_cs.iloc[-1]) if not sel_cs.empty else math.nan
        verter = (cota_s - nivel_atual) if (not math.isnan(cota_s) and not math.isnan(nivel_atual)) else math.nan

        def safe(v):
            return None if math.isnan(v) else round(v, 4)

        rows.append({
            "reservatorio": str(res),
            "capacidade":   safe(cap_total),
            "cota_sangria": safe(cota_s),
            "nivel_anterior": safe(nivel_anterior),
            "nivel_atual":  safe(nivel_atual),
            "var_nivel":    safe(var_nivel),
            "var_volume":   safe(var_volume),
            "volume":       safe(vol_atual),
            "percentual":   safe(perc_atual),
            "verter":       safe(verter),
        })

    prev_label = data_anterior.strftime("%d/%m/%Y") if data_anterior and not pd.isna(data_anterior) else ""
    curr_label = data_atual.strftime("%d/%m/%Y") if not pd.isna(data_atual) else ""
    prev_options = [d.strftime("%Y-%m-%d") for d in reversed(prev_candidates)]

    return {
        "rows": rows,
        "prev_label": prev_label,
        "curr_label": curr_label,
        "prev_options": prev_options,
    }
