import json
import sys

from huggingface_hub import hf_hub_download

repo_id = sys.argv[1]
filename = sys.argv[2]

path = hf_hub_download(repo_id=repo_id, filename=filename, repo_type="dataset")
print("saved at:", path)

good = 0
bad = 0
with open(path, encoding="utf-8") as handle:
    for line in handle:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            bad += 1
            continue
        good += 1
        if good <= 3:
            print({k: (str(v)[:300] + "...") if len(str(v))
                  > 300 else v for k, v in row.items()})

print("good rows:", good, "bad rows:", bad)
