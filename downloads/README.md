# Resume datasets (Kaggle)

Downloaded via `kagglehub` with `KAGGLEHUB_CACHE` set to this folder.

## palaksood97/resume-dataset

- Source: https://www.kaggle.com/datasets/palaksood97/resume-dataset
- Path: `datasets/palaksood97/resume-dataset/versions/1/Resumes/`
- ~228 `.docx` files (~12 MB)

## snehaanbhawal/resume-dataset

- Source: https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset
- Path: `datasets/snehaanbhawal/resume-dataset/versions/1/`
- Category folders under `data/data/` (e.g. `FINANCE`, `INFORMATION-TECHNOLOGY`, `HR`) plus `Resume/`
- ~2,485 files (~118 MB)

## Re-download

```bash
cd /path/to/resume-scoring-ai
export KAGGLEHUB_CACHE="$(pwd)/downloads"

python -c "import kagglehub; print(kagglehub.dataset_download('palaksood97/resume-dataset'))"
python -c "import kagglehub; print(kagglehub.dataset_download('snehaanbhawal/resume-dataset'))"
```
