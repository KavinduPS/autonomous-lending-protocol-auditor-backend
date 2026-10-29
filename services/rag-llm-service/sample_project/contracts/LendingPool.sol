pragma solidity ^0.8.0;

contract LendingPool {
    mapping(address => uint256) public balances;
    mapping(address => uint256) public collateral;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
    
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        balances[msg.sender] -= amount;
    }

    function borrow(uint256 amount) external {
        uint256 userCollateral = collateral[msg.sender];
        require(userCollateral > amount * 2, "Undercollateralized");
        balances[msg.sender] += amount;
    }
}
