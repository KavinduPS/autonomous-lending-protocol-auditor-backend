import { ethers } from "ethers";

// Anvil's default first dev account — always funded at genesis regardless
// of fork state, same address every Anvil instance, same fixed test mnemonic.
// EPA's exploit code should act as/control this address — no extra
// coordination needed since it's a standard Foundry/Anvil default.
const ATTACKER_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

export async function getAttackerBalance(forkUrl: string): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(forkUrl);
  return provider.getBalance(ATTACKER_ADDRESS);
}

export async function measureProfit(
  forkUrl: string,
  beforeBalanceWei: bigint,
): Promise<number> {
  const afterBalanceWei = await getAttackerBalance(forkUrl);
  const deltaWei = afterBalanceWei - beforeBalanceWei;
  return Number(ethers.formatEther(deltaWei));
}
