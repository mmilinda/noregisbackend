from typing import Optional
from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel
from bson import ObjectId
from models.visiteur import Visiteur
from models.visite import Visite
from models.document import DocumentScan


class VisiteurBody(BaseModel):
    nom: str
    prenom: str
    date_naissance: Optional[str] = None
    numero_piece: str
    type_piece: str = "CNI"


class VisiteurUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    date_naissance: Optional[str] = None
    numero_piece: Optional[str] = None
    type_piece: Optional[str] = None


def _visiteur_dict(v: Visiteur) -> dict:
    d = v.dict(by_alias=False)
    d["id"] = str(v.id)
    d.pop("_id", None)
    return d


async def creer_visiteur(body: VisiteurBody):
    existe = await Visiteur.find_one(Visiteur.numero_piece == body.numero_piece)
    if existe:
        return {
            "success":    True,
            "message":    "Visiteur déjà enregistré.",
            "visiteur":   _visiteur_dict(existe),
            "est_nouveau": False,
        }

    date_naissance = None
    if body.date_naissance:
        try:
            date_naissance = datetime.fromisoformat(body.date_naissance)
        except ValueError:
            pass

    visiteur = Visiteur(
        nom=body.nom,
        prenom=body.prenom,
        date_naissance=date_naissance,
        numero_piece=body.numero_piece,
        type_piece=body.type_piece,
    )
    await visiteur.insert()
    return {
        "success":    True,
        "message":    "Visiteur créé.",
        "visiteur":   _visiteur_dict(visiteur),
        "est_nouveau": True,
    }


async def lister_visiteurs(page: int = 1, limit: int = 20):
    skip = (page - 1) * limit
    # ✅ Beanie : find().count() et non Visiteur.count()
    total = await Visiteur.find().count()
    visiteurs = (
        await Visiteur.find()
        .sort(-Visiteur.created_at)
        .skip(skip)
        .limit(limit)
        .to_list()
    )
    return {
        "success":  True,
        "total":    total,
        "page":     page,
        "pages":    -(-total // limit),
        "visiteurs": [_visiteur_dict(v) for v in visiteurs],
    }


async def get_visiteur(visiteur_id: str):
    try:
        oid = ObjectId(visiteur_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID invalide.")

    visiteur = await Visiteur.get(oid)
    if not visiteur:
        raise HTTPException(status_code=404, detail="Visiteur introuvable.")

    visites   = await Visite.find(Visite.visiteur_id == oid).sort(-Visite.heure_entree).to_list()
    documents = await DocumentScan.find(DocumentScan.visiteur_id == oid).to_list()

    d = _visiteur_dict(visiteur)
    d["visites"]   = [v.dict(by_alias=False) for v in visites]
    d["documents"] = [doc.dict(by_alias=False) for doc in documents]
    return {"success": True, "visiteur": d}


async def modifier_visiteur(visiteur_id: str, body: VisiteurUpdate):
    try:
        oid = ObjectId(visiteur_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID invalide.")

    visiteur = await Visiteur.get(oid)
    if not visiteur:
        raise HTTPException(status_code=404, detail="Visiteur introuvable.")

    update_data = {k: v for k, v in body.dict().items() if v is not None}
    for key, val in update_data.items():
        setattr(visiteur, key, val)

    visiteur.updated_at = datetime.utcnow()
    await visiteur.save()
    return {"success": True, "message": "Visiteur mis à jour.", "visiteur": _visiteur_dict(visiteur)}