import sys

from datasets import load_dataset

dataset_id = sys.argv[1]
split = sys.argv[2] if len(sys.argv) > 2 else "train"
config = sys.argv[3] if len(sys.argv) > 3 else None

ds = load_dataset(dataset_id, config, split=split, streaming=True)
for i, row in enumerate(ds):
    print({k: (str(v)[:300] + "...") if len(str(v))
          > 300 else v for k, v in row.items()})
    if i == 2:
        break
