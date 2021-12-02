// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

contract PriceFeedMock {
    mapping(address => uint) public priceOf;

    function getPrice(address token) public view returns(uint price) {
      price = priceOf[token];
    }

    function setPrice(address token, uint price) public {
      priceOf[token] = price;
    }
}