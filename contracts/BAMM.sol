//SPDX-License-Identifier: Unlicense
pragma solidity >= 0.6.6;

import "./QuickswapLPManager.sol";
import "./CropJoinAdapter.sol";
import '@uniswap/v2-periphery/contracts/libraries/SafeMath.sol';
import "@openzeppelin/contracts/access/Ownable.sol";


contract BAMM is UniswapLPManager, CropJoinAdapter, Ownable {
  IERC20 immutable public collateralToken;

  // mapping from token to price feed
  PriceFeed immutable collateralFeed;

  constructor(
    IERC20 _lpToken,
    IERC20 _token0,
    IERC20 _token1,
    PriceFeed _feed,
    UniswapV2Router02 _uniRouter,
    IQuickswapStakingRewards _quickswapStaking,
    IERC20 _collateralToken,
    PriceFeed _collateralFeed,
    IERC20 _cropToken
  )
    UniswapLPManager(_lpToken, _token0, _token1, _feed, _uniRouter, _quickswapStaking)
    CropJoinAdapter(address(_cropToken))
    public
  {
    require(_collateralToken != _lpToken, "collateral cannot be lp token");
    require(_collateralToken != _token0, "collateral cannot be token 0");
    require(_collateralToken != _token1, "collateral cannot be token 1");    

    collateralToken = _collateralToken;
    collateralFeed = _collateralFeed;
  }

  function getUSDValue() public returns(uint backstop, uint collateral) {
    backstop = getUSDBalance();
    collateral = collateralToken.balanceOf(address(this)).mul(collateralFeed.getPrice(token0)) / (uint(10) ** collateralToken.decimals());
  }

  function deposit(uint lpTokenAmount) public {
    // TODO
  }

  function withdraw(uint shares) public {
    // TODO
  }

  
}
