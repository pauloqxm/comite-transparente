import os
import json
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, field_validator

router = APIRouter()


class ContatoForm(BaseModel):
    nome: str
    email: EmailStr
    telefone: str = ""
    cpf_cnpj: str = ""
    cidade_estado: str
    tipo_contato: str
    outro_contato: str = ""
    assunto: str
    descricao: str
    canal_resposta: str = "E-mail"
    lgpd_consentimento: bool
    receber_informativos: bool = False

    @field_validator("nome", "cidade_estado", "assunto", "descricao")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Campo obrigatório não pode ser vazio.")
        return v.strip()

    @field_validator("lgpd_consentimento")
    @classmethod
    def must_consent(cls, v):
        if not v:
            raise ValueError("É necessário aceitar os termos da LGPD.")
        return v


def _salvar_em_planilha(dados: dict) -> bool:
    """Salva no Google Sheets usando gspread + conta de serviço de variável de ambiente."""
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        creds_json = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "")
        if not creds_json:
            return False

        creds_dict = json.loads(creds_json)
        scopes = [
            "https://spreadsheets.google.com/feeds",
            "https://www.googleapis.com/auth/drive",
        ]
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
        client = gspread.authorize(creds)

        planilha = client.open_by_key("1aEzpFdPz2lbG7IM9OMIFqVCUtEVkqV18JaytGTX9ugs")
        aba = planilha.worksheet("Página1")

        linha = [
            dados.get("data_envio", ""),
            dados.get("nome", ""),
            dados.get("email", ""),
            dados.get("telefone", ""),
            dados.get("cpf_cnpj", ""),
            dados.get("cidade_estado", ""),
            dados.get("tipo_contato", ""),
            dados.get("outro_contato", ""),
            dados.get("assunto", ""),
            dados.get("descricao", ""),
            dados.get("canal_resposta", ""),
            "Sim" if dados.get("lgpd_consentimento") else "Não",
            "Sim" if dados.get("receber_informativos") else "Não",
        ]
        aba.append_row(linha)
        return True
    except Exception:
        return False


@router.post("/contato")
async def enviar_contato(form: ContatoForm):
    dados = form.model_dump()
    dados["data_envio"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    ok = _salvar_em_planilha(dados)
    if ok:
        return {"success": True, "message": "Mensagem enviada com sucesso!"}
    return {"success": False, "message": "Mensagem recebida, porém houve falha ao salvar na planilha. Tente contactar-nos por e-mail."}
