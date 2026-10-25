"""FastAPI app serving the wind forecast dataset artifact over HTTP."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .data_access import get_accuracy, get_day, get_meta

app = FastAPI()

# No auth, no sensitive data in this dataset — open CORS is acceptable
# for this scope.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/day")
def day(date: str, cutoff: str):
    result = get_day(date, cutoff)
    if result is None:
        return JSONResponse(status_code=404, content={"error": "not found"})
    return result


@app.get("/api/accuracy")
def accuracy(cutoff: str):
    result = get_accuracy(cutoff)
    if result is None:
        return JSONResponse(status_code=404, content={"error": "not found"})
    return result


@app.get("/api/meta")
def meta():
    return get_meta()
