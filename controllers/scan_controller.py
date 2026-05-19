import os
import pathlib
import random
import time
import re
from fastapi import HTTPException, UploadFile, Request
from veryfi import Client
from models.document import DocumentScan

veryfi_client = None

def get_veryfi_client():
    global veryfi_client
    if veryfi_client is None:
        client_id = os.getenv("VERYFI_CLIENT_ID")
        client_secret = os.getenv("VERYFI_CLIENT_SECRET")
        username = os.getenv("VERYFI_USERNAME")
        api_key = os.getenv("VERYFI_API_KEY")
        if not all([client_id, client_secret, username, api_key]):
            raise ValueError("Variables Veryfi manquantes")
        veryfi_client = Client(client_id, client_secret, username, api_key)
        print("✅ Client Veryfi initialisé")
    return veryfi_client

def extraire_infos_depuis_veryfi(response: dict) -> dict:
    ocr_text = response.get('ocr_text', '')
    infos = {
        "nom": None,
        "prenom": None,
        "date_naissance": None,
        "numero_piece": None,
        "type_piece": "CNI",
    }

    # Nom
    m = re.search(r'Nom\s*:?\s*([A-Z\s]+?)(?:\n|Prénom|$)', ocr_text, re.IGNORECASE)
    if m:
        infos["nom"] = m.group(1).strip()
    # Prénom
    m = re.search(r'Pr[ée]nom\s*:?\s*([A-Za-z\s]+?)(?:\n|Date|$)', ocr_text, re.IGNORECASE)
    if m:
        infos["prenom"] = m.group(1).strip()
    # Date de naissance
    m = re.search(r'Date de Naissance\s*:?\s*(\d{2}/\d{2}/\d{4})', ocr_text)
    if m:
        j, mo, a = m.group(1).split('/')
        infos["date_naissance"] = f"{a}-{mo}-{j}"
    # Numéro de pièce
    num = response.get('document_reference_number')
    if not num:
        m = re.search(r'No\s*:?\s*([A-Z0-9]+)', ocr_text)
        if m:
            num = m.group(1)
    infos["numero_piece"] = num
    # Type de pièce
    if "PASSEPORT" in ocr_text.upper():
        infos["type_piece"] = "PASSEPORT"
    elif "PERMIS" in ocr_text.upper():
        infos["type_piece"] = "PERMIS"
    elif "CARTE DE SEJOUR" in ocr_text.upper():
        infos["type_piece"] = "CARTE_SEJOUR"
    else:
        infos["type_piece"] = "CNI"
    return infos

async def scanner_image(request: Request, file: UploadFile):
    if not file:
        raise HTTPException(status_code=400, detail="Aucune image reçue.")

    upload_dir = os.getenv("UPLOAD_DIR", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    unique = f"{int(time.time() * 1000)}_{random.randint(0, 999999999)}"
    ext = pathlib.Path(file.filename).suffix
    nom_fichier = f"scan_{unique}{ext}"
    chemin_fichier = os.path.join(upload_dir, nom_fichier)

    contents = await file.read()
    with open(chemin_fichier, "wb") as f:
        f.write(contents)

    document = DocumentScan(
        nom_fichier=nom_fichier,
        chemin_fichier=chemin_fichier,
        type_mime=file.content_type,
        taille_fichier=len(contents),
    )
    await document.insert()

    try:
        client = get_veryfi_client()
        response = client.process_document(chemin_fichier, categories=[])
        print("✅ Extraction Veryfi réussie")
        infos_extraites = extraire_infos_depuis_veryfi(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Veryfi : {str(e)}")
    finally:
        if os.path.exists(chemin_fichier):
            os.remove(chemin_fichier)

    return {
        "success": True,
        "message": "Scan terminé avec succès via Veryfi.",
        "document": {"id": str(document.id), "nom_fichier": nom_fichier},
        "infosExtraites": infos_extraites,          # ← camelCase pour le front
        "texte_raw": response.get('ocr_text', ''),
    }