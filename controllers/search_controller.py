from typing import Optional
from datetime import datetime
from fastapi import HTTPException
from bson import ObjectId
from models.visiteur import Visiteur
from models.visite import Visite

async def rechercher(query: Optional[str] = None, statut: Optional[str] = None, date_debut: Optional[str] = None, date_fin: Optional[str] = None):
    if not query and not statut and not date_debut:
        raise HTTPException(status_code=400, detail="Paramètre de recherche requis.")
    if query:
        visiteurs = await Visiteur.find({"$or": [
            {"nom": {"$regex": query, "$options": "i"}},
            {"prenom": {"$regex": query, "$options": "i"}},
            {"numero_piece": {"$regex": query, "$options": "i"}},
        ]}).limit(50).to_list()
    else:
        visiteurs = await Visiteur.find_all().limit(50).to_list()
    filtre_visite = {}
    if statut:
        filtre_visite["statut"] = statut
    if date_debut:
        fin = datetime.fromisoformat((date_fin or date_debut) + "T23:59:59")
        filtre_visite["heure_entree"] = {
            "$gte": datetime.fromisoformat(date_debut + "T00:00:00"),
            "$lte": fin,
        }
    resultats = []
    for v in visiteurs:
        visite_query = Visite.find(Visite.visiteur_id == v.id)
        if filtre_visite.get("statut"):
            visite_query = visite_query.find(Visite.statut == filtre_visite["statut"])
        if filtre_visite.get("heure_entree"):
            visite_query = visite_query.find(
                Visite.heure_entree >= filtre_visite["heure_entree"]["$gte"],
                Visite.heure_entree <= filtre_visite["heure_entree"]["$lte"],
            )
        visites = await visite_query.sort(-Visite.heure_entree).limit(5).to_list()
        d = v.dict()
        d["id"] = str(v.id)
        d["visites"] = [vi.dict() for vi in visites]
        resultats.append(d)
    return {"success": True, "total": len(resultats), "resultats": resultats}