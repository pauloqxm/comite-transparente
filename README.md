
# Painel Banabuiú — App multipágina (Streamlit)

## Como usar
1. Instale dependências: `pip install -r requirements.txt`
2. Coloque os arquivos `.geojson` na RAIZ do projeto (mesmo nível do `app.py`):
   - trechos_perene.geojson
   - Açudes_Monitorados.geojson
   - Sedes_Municipais.geojson
   - c_gestoras.geojson
   - poligno_municipios.geojson
   - bacia_banabuiu.geojson
   - pontos_controle.geojson
3. Rode: `streamlit run app.py`

## Estrutura
- `app.py` → página inicial/landing (menu lateral lista as páginas).
- `pages/` → cada página do app multipágina:
  - `1_🏠_Pagina_Inicial.py`
  - `2_🗺️_Acudes_Monitorados.py`
  - `3_📜_Documentos_Oficiais.py`
  - `4_📈_Simulacoes.py`
- `utils/common.py` → header fixo e carregamento dos GeoJSONs.

## Observações
- O conteúdo foi reorganizado a partir do seu arquivo original em páginas separadas, mantendo a lógica principal.
- Qualquer função extra/ajuste pode ser centralizado em `utils/common.py`.
