// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract TxOriginExample {
    address public owner = msg.sender;

    function changeOwner(address newOwner) external {
        require(tx.origin == owner, "Unauthorized");
        owner = newOwner;
    }
}