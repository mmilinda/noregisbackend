from typing import Optional
from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel
from bson import ObjectId
from models.visite import Visite
from models.visiteur import Visiteur

class EntreeBody(BaseModel):
    visiteur_id: str
    personne_visitee: str
    service: str
    motif: Optional[str] = None

def _visite_dict(v: Visite) -> dict:
    d = v.dict()
    d["id"] = str(v.id)
    d["visiteur_id"] = str(v.visiteur_id)
    d.pop("_id", None)
    return d

async def enregistrer_entree(body: EntreeBody):
    try:
        oid = ObjectId(body.visiteur_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID visiteur invalide.")
    visiteur = await Visiteur.get(oid)
    if not visiteur:
        raise HTTPException(status_code=404, detail="Visiteur introuvable.")
    visite_en_cours = await Visite.find_one(Visite.visiteur_id == oid, Visite.statut == "EN_COURS")
    if visite_en_cours:
        raise HTTPException(status_code=409, detail="Ce visiteur est déjà à l'intérieur.")
    visite = Visite(
        visiteur_id=oid,
        personne_visitee=body.personne_visitee,
        service=body.service,
        motif=body.motif,
        heure_entree=datetime.utcnow(),
        statut="EN_COURS",
    )
    await visite.insert()
    d = _visite_dict(visite)
    d["visiteur"] = visiteur.dict()
    return {"success": True, "message": "Entrée enregistrée.", "visite": d}

async def enregistrer_sortie(visite_id: str):
    try:
        oid = ObjectId(visite_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID invalide.")
    visite = await Visite.get(oid)
    if not visite:
        raise HTTPException(status_code=404, detail="Visite introuvable.")
    if visite.statut == "TERMINE":
        raise HTTPException(status_code=400, detail="Visite déjà terminée.")
    visite.heure_sortie = datetime.utcnow()
    visite.statut = "TERMINE"
    visite.updated_at = datetime.utcnow()
    await visite.save()
    duree_minutes = int((visite.heure_sortie - visite.heure_entree).total_seconds() / 60)
    visiteur = await Visiteur.get(visite.visiteur_id)
    d = _visite_dict(visite)
    if visiteur:
        d["visiteur"] = visiteur.dict()
    return {"success": True, "message": f"Sortie enregistrée. Durée : {duree_minutes} min.", "visite": d}

async def lister_visites(statut: Optional[str] = None, date: Optional[str] = None, page: int = 1, limit: int = 20):
    try:
        # Construction du filtre
        filter_query = {}
        if statut:
            filter_query["statut"] = statut
        if date:
            try:
                debut = datetime.fromisoformat(date + "T00:00:00")
                fin = datetime.fromisoformat(date + "T23:59:59")
                filter_query["heure_entree"] = {"$gte": debut, "$lte": fin}
            except ValueError:
                raise HTTPException(status_code=400, detail="Format de date invalide. Utilisez YYYY-MM-DD.")
        
        # Requête de base
        query = Visite.find(filter_query)
        total = await query.count()
        skip = (page - 1) * limit
        visites = await query.sort(-Visite.heure_entree).skip(skip).limit(limit).to_list()
        
        # Chargement des visiteurs associés
        results = []
        for v in visites:
            d = _visite_dict(v)
            visiteur = await Visiteur.get(v.visiteur_id)
            if visiteur:
                d["visiteur"] = visiteur.dict()
            results.append(d)
        
        return {
            "success": True,
            "total": total,
            "page": page,
            "pages": (total + limit - 1) // limit,
            "visites": results,
        }
    except Exception as e:
        print(f"Erreur dans lister_visites: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")

async def visites_en_cours():
    try:
        visites = await Visite.find(Visite.statut == "EN_COURS").sort(-Visite.heure_entree).to_list()
        results = []
        for v in visites:
            d = _visite_dict(v)
            visiteur = await Visiteur.get(v.visiteur_id)
            if visiteur:
                d["visiteur"] = visiteur.dict()
            results.append(d)
        return {"success": True, "total": len(results), "visites": results}
    except Exception as e:
        print(f"Erreur dans visites_en_cours: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")