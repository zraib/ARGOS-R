# ============================================================================
# ARGOS / IRIS — boîte à outils de provisionnement des tuiles (image légère)
# Python seul, bibliothèque standard : sqlite3 (MBTiles), urllib, zipfile.
# ============================================================================
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    TILES_DIR=/data \
    ZONES_FILE=/config/zones.json \
    PBF_DIR=/pbf
WORKDIR /tools
COPY tiles.py ./
VOLUME ["/data", "/pbf"]
ENTRYPOINT ["python", "/tools/tiles.py"]
CMD ["status"]
