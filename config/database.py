# config/database.py
import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from dotenv import load_dotenv

load_dotenv()


async def connect_db():
    # Import des modèles (assure-toi que les chemins sont corrects)
    from models.visiteur import Visiteur
    from models.utilisateur import Utilisateur
    from models.visite import Visite
    from models.document import DocumentScan

    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        raise Exception("La variable d'environnement MONGODB_URI n'est pas définie")

    # 1. Créer le client
    client = AsyncIOMotorClient(mongodb_uri)

    # 2. ** CORRECTION : Redéfinir la méthode get_io_loop **
    # Cette ligne est cruciale pour résoudre l'erreur "NoneType is not callable"
    client.get_io_loop = asyncio.get_event_loop

    # 3. Récupérer la base de données
    db_name = os.getenv("DB_NAME", "registre_visiteurs")  # Assure-toi que ce nom est correct
    db = client[db_name]

    # 4. Initialiser Beanie avec tous les modèles
    await init_beanie(
        database=db,
        document_models=[Visiteur, Utilisateur, Visite, DocumentScan],
    )

    print("✅ MongoDB connectée avec Beanie")