from app.knowledge.retriever import get_retriever

retriever = get_retriever()
queries = [
    "function withdraw() public { (bool ok,) = msg.sender.call{value: balances[msg.sender]}(''); balances[msg.sender] = 0; }",
    "lending pool reads collateral price from a single DEX pool spot price that can be manipulated with a flash loan",
    "anyone can call a public function to change the owner of the contract",
]
for query in queries:
    print("\nQUERY:", query[:90])
    for chunk in retriever.retrieve(query, top_k=5):
        print(
            f"  {chunk.score:.3f} {chunk.source:13} {chunk.vuln_class:18} {chunk.title[:70]}")
