from fastapi import FastAPI

app = FastAPI(title="Teashore API")


@app.get("/")
def root():
    return {"status": "Teashore backend is running"}
