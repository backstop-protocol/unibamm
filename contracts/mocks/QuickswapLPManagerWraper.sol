// SPDX-License-Identifier: MIT

pragma solidity 0.6.6;

import "./../QuickswapLPManager.sol";

contract QuickswapLPManagerWraper is UniswapLPManager {

  constructor(
    IERC20 _lpToken,
    IERC20 _token0,
    IERC20 _token1,
    PriceFeed _feed,
    UniswapV2Router02 _uniRouter,
    IQuickswapStakingRewards _quickswapStaking
  )
  public UniswapLPManager(
    _lpToken, _token0, _token1, _feed, _uniRouter, _quickswapStaking
  ){}

  function withdrawLpWrapper(uint lpAmount) public {
    withdrawLP(lpAmount);
  }

  function withdrawTokenWrapper(IERC20 token, uint amount) public {
    super.withdrawToken(token, amount);
  }
}