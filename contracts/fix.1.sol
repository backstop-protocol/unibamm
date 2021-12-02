pragma solidity =0.6.6;


import '@uniswap/v2-periphery/contracts/test/ERC20.sol';

contract ERC20fix is ERC20 {
  constructor(uint _totalSupply) public ERC20(_totalSupply) {}
}
