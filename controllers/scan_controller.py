import os
import pathlib
import random
import time
from fastapi import HTTPException, UploadFile, Request
from veryfi import Client
from models.document import DocumentScan

# Initialisation du client Veryfi (un seul objet pour toute l'application)
veryfi_client = None

def get_veryfi_client():
    global veryfi_client
    if veryfi_client is None:
        client_id = os.getenv("VERYFI_CLIENT_ID")
        client_secret = os.getenv("VERYFI_CLIENT_SECRET")
        username = os.getenv("VERYFI_USERNAME")
        api_key = os.getenv("VERYFI_API_KEY")

        if not all([client_id, client_secret, username, api_key]):
            raise ValueError("Variables Veryfi manquantes dans l'environnement")

        veryfi_client = Client(client_id, client_secret, username, api_key)
        print("✅ Client Veryfi initialisé")
    return veryfi_client


async def scanner_image(request: Request, file: UploadFile):
    if not file:
        raise HTTPException(status_code=400, detail="Aucune image reçue.")

    # Sauvegarde locale
    upload_dir = os.getenv("UPLOAD_DIR", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    unique = f"{int(time.time() * 1000)}_{random.randint(0, 999999999)}"
    ext = pathlib.Path(file.filename).suffix
    nom_fichier = f"scan_{unique}{ext}"
    chemin_fichier = os.path.join(upload_dir, nom_fichier)

    contents = await file.read()
    with open(chemin_fichier, "wb") as f:
        f.write(contents)

    # Enregistrement en base
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
        print("✅ Veryfi OK", response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Veryfi : {str(e)}")

    # Adapter les champs selon vos besoins
    infos_extraites = {
        "nom": response.get('vendor', {}).get('name'),
        "prenom": None,
        "numero_piece": response.get('invoice_number') or response.get('document_number'),
        "type_piece": "CNI",
        "date_naissance": None,
        "adresse": response.get('vendor', {}).get('address'),
        "date_document": response.get('date'),
        "montant_total": response.get('total'),
        "categorie": response.get('category'),
    }

    return {
        "success": True,
        "message": "Scan via Veryfi réussi",
        "document": {"id": str(document.id), "nom_fichier": nom_fichier},
        "infos_extraites": infos_extraites,
        "texte_raw": response.get('ocr_text'),
    }