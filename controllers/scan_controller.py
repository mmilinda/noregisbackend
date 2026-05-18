import os
import re
import time
import random
import pathlib
from typing import Optional
from fastapi import HTTPException, UploadFile, Request
from PIL import Image
import pytesseract
from models.document import DocumentScan

# ── Constantes ────────────────────────────────────────────────────────────────
BLACKLIST = {
    "REPUBLIQUE", "FRANCAISE", "FRANÇAISE", "SENEGAL", "SÉNÉGAL", "CARTE",
    "NATIONALE", "IDENTITE", "IDENTITÉ", "DOCUMENT", "PASSEPORT", "NOM",
    "SEXE", "NATIONALITE", "NATIONALITÉ", "CEDEAO", "ECOWAS", "IDENTITY",
    "CARD", "BILHETE", "IDENTIDADE", "OWAS", "TAILLE", "LIEU", "NAISSANCE",
    "DELIVRANCE", "EXPIRATION", "CENTRE", "ENREGISTREMENT", "DOMICILE",
    "ADRESSE", "DATE", "PRENOM", "PRENOMS", "COMMUNE", "BIRTH", "SURNAME",
    "GIVEN", "FORENAME", "NAMES", "TYPE", "PIECE", "NUMERO", "NUMÉRO",
    "SENEGALAN", "SÉNÉGALAISE",
}

LABELS_REGEX = re.compile(
    r"^(Pr[ée]noms?|Nom|Date|Sexe|Taille|Lieu|N[°º]|Carte|Birth|Surname|Given|Forename)\b",
    re.IGNORECASE,
)

def nettoyer(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    s = re.sub(r'[""«»]', "", s)
    s = re.sub(r",", " ", s)
    s = re.sub(r"[^a-zA-ZÀ-ÿ\-\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or None

def extraire_date(texte: str) -> Optional[str]:
    m = re.search(r"\b(\d{2})[/\-](\d{2})[/\-](\d{4})\b", texte)
    if m:
        j, mo, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= j <= 31 and 1 <= mo <= 12 and 1900 <= a <= 2100:
            return f"{a:04d}-{mo:02d}-{j:02d}"
    nums_only = re.sub(r"[^0-9]", " ", texte)
    for v in re.findall(r"\b\d{8}\b", nums_only):
        j, mo, a = int(v[:2]), int(v[2:4]), int(v[4:8])
        if 1 <= j <= 31 and 1 <= mo <= 12 and 1900 <= a <= 2100:
            return f"{a:04d}-{mo:02d}-{j:02d}"
    return None

def is_valid_nom(s: str) -> bool:
    if not s:
        return False
    up = s.upper().strip()
    if up in BLACKLIST:
        return False
    if len(up) < 2 or len(up) > 25:
        return False
    if re.search(r"\d", up):
        return False
    return True

def extraire_champ(lignes, label_regex, labels_a_ignorer=None):
    for i, ligne in enumerate(lignes):
        if not label_regex.search(ligne):
            continue
        apres_label = label_regex.sub("", ligne).lstrip(":- ").strip()
        if len(apres_label) >= 2 and not apres_label.isdigit():
            mots = re.findall(r"\b[A-ZÀ-Ÿa-zà-ÿ]{2,}\b", apres_label)
            valides = [m for m in mots if is_valid_nom(m)]
            if valides:
                return " ".join(valides)
        for j in range(1, 5):
            if i + j >= len(lignes):
                break
            l = lignes[i + j].strip()
            if not l:
                continue
            if labels_a_ignorer and labels_a_ignorer.search(l):
                continue
            if l.isdigit() or len(l) < 2:
                continue
            mots = re.findall(r"\b[A-ZÀ-Ÿa-zà-ÿ]{2,}\b", l)
            valides = [m for m in mots if is_valid_nom(m)]
            if valides:
                return " ".join(valides)
    return None

def extraire_infos_piece(texte: str) -> dict:
    infos = {"nom": None, "prenom": None, "numero_piece": None, "type_piece": "CNI", "date_naissance": None}
    texte_clean = texte.replace("|", "I").replace("\u2018", "'").replace("\u2019", "'")
    lignes = [l.strip() for l in texte_clean.split("\n") if l.strip()]
    upper = texte_clean.upper()
    # Type
    if "PASSEPORT" in upper:
        infos["type_piece"] = "PASSEPORT"
    elif "PERMIS DE CONDUIRE" in upper:
        infos["type_piece"] = "PERMIS"
    elif any(k in upper for k in ["CARTE D'IDENTITE", "CARTE NATIONALE", "CEDEAO", "ECOWAS", "IDENTITY CARD", "CNI"]):
        infos["type_piece"] = "CNI"
    elif "SEJOUR" in upper:
        infos["type_piece"] = "CARTE_SEJOUR"
    # Date naissance
    for i, ligne in enumerate(lignes):
        if re.search(r"date\s*de\s*naiss|date\s*of\s*birth", ligne, re.IGNORECASE):
            m = re.search(r"\b(\d{2})[/\-](\d{2})[/\-](\d{4})\b", ligne)
            if m:
                infos["date_naissance"] = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
                break
            for j in range(1, 4):
                if i + j < len(lignes):
                    d = extraire_date(lignes[i + j])
                    if d:
                        infos["date_naissance"] = d
                        break
            if infos["date_naissance"]:
                break
    if not infos["date_naissance"]:
        infos["date_naissance"] = extraire_date(texte_clean)
    # Prénom
    prenom_brut = extraire_champ(lignes, re.compile(r"Pr[ée]noms?\s*[:\-]?|Given\s*names?\s*[:\-]?|Forenames?\s*[:\-]?", re.IGNORECASE), LABELS_REGEX)
    if prenom_brut:
        infos["prenom"] = nettoyer(prenom_brut)
    # Nom
    nom_brut = extraire_champ(lignes, re.compile(r"^Nom\s*[:\-]?$|^Nom\s+[A-Z]|Surname\s*[:\-]?|Last\s*name\s*[:\-]?", re.IGNORECASE), LABELS_REGEX)
    if nom_brut:
        infos["nom"] = nettoyer(nom_brut)
    if not infos["nom"] and infos["prenom"]:
        prenom_upper = infos["prenom"].upper()
        pos = upper.find(prenom_upper)
        if pos != -1:
            apres = texte_clean[pos + len(infos["prenom"]):]
            candidats = re.findall(r"\b[A-ZÀ-Ÿ]{2,}\b", apres)
            val = next((c for c in candidats if is_valid_nom(c) and c != prenom_upper), None)
            if val:
                infos["nom"] = nettoyer(val)
    # Numéro pièce
    for i, ligne in enumerate(lignes):
        if re.search(r"N[°º\.]\s*de\s*la\s*carte|carte\s*d.identit", ligne, re.IGNORECASE):
            m = re.search(r"[\d][\d\s]{5,}", ligne)
            if m:
                infos["numero_piece"] = m.group(0).replace(" ", "")
                break
            for j in range(1, 5):
                if i + j < len(lignes):
                    m2 = re.search(r"[\d][\d\s]{5,}", lignes[i + j])
                    if m2:
                        code = m2.group(0).replace(" ", "")
                        if len(code) >= 6:
                            infos["numero_piece"] = code
                            break
            if infos["numero_piece"]:
                break
    if not infos["numero_piece"]:
        for i, ligne in enumerate(lignes):
            if re.search(r"N[°º]\s*DU\s*DOCUMENT|Document\s*No", ligne, re.IGNORECASE):
                for j in range(5):
                    if i + j < len(lignes):
                        codes = re.findall(r"\b([A-Z0-9]{6,15})\b", lignes[i + j])
                        code = next((c for c in codes if re.search(r"[A-Z]", c) and re.search(r"[0-9]", c)), None)
                        if code:
                            infos["numero_piece"] = code
                            break
                if infos["numero_piece"]:
                    break
    if not infos["numero_piece"]:
        codes = re.findall(r"\b([A-Z][A-Z0-9]{5,14})\b", texte_clean)
        infos["numero_piece"] = next((c for c in codes if re.search(r"[A-Z]", c) and re.search(r"[0-9]", c)), None)
    # MRZ fallback
    if not infos["nom"] or not infos["prenom"]:
        mrz_lines = [l for l in lignes if re.match(r"^[A-Z<]{20,}", l)]
        if mrz_lines:
            parts = [p for p in mrz_lines[0].replace("<", " ").split() if p]
            if not infos["nom"] and len(parts) > 0 and is_valid_nom(parts[0]):
                infos["nom"] = nettoyer(parts[0])
            if not infos["prenom"] and len(parts) > 1 and is_valid_nom(parts[1]):
                infos["prenom"] = nettoyer(parts[1])
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
        image = Image.open(chemin_fichier)
        texte = pytesseract.image_to_string(image, lang="fra+eng", config="--psm 6")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur OCR : {str(e)}")
    print("📄 OCR RAW:\n", texte)
    infos_extraites = extraire_infos_piece(texte)
    return {
        "success": True,
        "message": "Scan terminé.",
        "document": {"id": str(document.id), "nom_fichier": nom_fichier},
        "infos_extraites": infos_extraites,
        "texte_raw": texte,
    }