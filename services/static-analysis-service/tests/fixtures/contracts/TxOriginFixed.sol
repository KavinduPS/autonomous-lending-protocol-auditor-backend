// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract TxOriginFixed {
    address public owner = msg.sender;

    function changeOwner(address newOwner) external {
        require(msg.sender == owner, "Unauthorized");
        owner = newOwner;
    }
}