from fastapi import APIRouter, Depends, UploadFile, File, Request
from controllers.scan_controller import scanner_image
from middlewares.auth import get_current_user

router = APIRouter(tags=["Scan"], dependencies=[Depends(get_current_user)])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}

@router.post("/")
async def route_scan(request: Request, image: UploadFile = File(...)):
    if image.content_type not in ALLOWED_TYPES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Format non accepté (JPEG, PNG, WebP, PDF).")
    return await scanner_image(request, image)