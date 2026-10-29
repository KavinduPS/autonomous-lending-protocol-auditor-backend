from app.knowledge.loaders import LoadStats, load_code4rena, load_defihacklabs, load_scv


def key(chunk) -> str:
    return " ".join(chunk.text.lower().split())


for name, loader in [("scv", load_scv), ("defihacklabs", load_defihacklabs), ("code4rena", load_code4rena)]:
    chunks = list(loader(LoadStats()))
    print(name, "entries:", len(chunks),
          "unique texts:", len({key(c) for c in chunks}))
