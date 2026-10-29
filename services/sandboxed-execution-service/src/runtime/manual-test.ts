import "dotenv/config";
import { runExecution } from "./execute";

const EXPLOIT_CODE = `
pragma solidity ^0.8.19;
import "forge-std/Test.sol";

contract ExploitTest is Test {
    function setUp() public {}
    function testExploit() public {
        assertEq(uint256(1), uint256(1));
    }
}
`;

async function main() {
  const result = await runExecution({
    audit_id: "manual-test-001",
    chain: "ethereum",
    block_number: 15767837, // UERII incident block, per README section 7
    exploit_code: EXPLOIT_CODE,
    mode: "exploit_attempt",
  });

  console.log("=== EXECUTION RESULT ===");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
