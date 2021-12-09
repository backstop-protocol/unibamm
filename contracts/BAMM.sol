//SPDX-License-Identifier: Unlicense
pragma solidity >= 0.6.6;

import '@uniswap/v2-periphery/contracts/libraries/SafeMath.sol';
import "./QuickswapLPManager.sol";
import "./CropJoinAdapter.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract BAMM is UniswapLPManager, CropJoinAdapter, Ownable {
  IERC20 immutable public collateralToken;

  // mapping from token to price feed
  PriceFeed immutable collateralFeed;

  uint constant public PRECISION = 1e18;

  event UserDeposit(address indexed user, uint lusdAmount, uint numShares);

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
    require(_collateralToken != _cropToken, "collateral cannot be cropToken");    

    collateralToken = _collateralToken;
    collateralFeed = _collateralFeed;
  }

  function getUSDValue() public returns(uint backstop, uint collateral, uint staked) {
    backstop = getUSDBalance();
    collateral = collateralToken.balanceOf(address(this)).mul(collateralFeed.getPrice(token0)) / (uint(10) ** collateralToken.decimals());
    //staked = quickswapStaking.balanceOf(address(this));
  }

  /* 
        function deposit(uint lusdAmount) external {        
        // update share
        uint lusdValue = LUSD.balanceOf(address(this));
        uint ethValue = address(this).balance;

        uint price = fetchPrice();
        require(ethValue == 0 || price > 0, "deposit: chainlink is down");

        uint totalValue = lusdValue.add(ethValue.mul(price) / PRECISION);

        // this is in theory not reachable. if it is, better halt deposits
        // the condition is equivalent to: (totalValue = 0) ==> (totalSupply = 0)
        require(totalValue > 0 || totalSupply == 0, "deposit: system is rekt");

        uint newShare = PRECISION;
        if(totalSupply > 0) newShare = totalSupply.mul(lusdAmount) / totalValue;

        // deposit
        require(LUSD.transferFrom(msg.sender, address(this), lusdAmount), "deposit: transferFrom failed");

        // update LP token
        mint(msg.sender, newShare);

        emit UserDeposit(msg.sender, lusdAmount, newShare);        
    }
   */
  function deposit(uint lpTokenAmount) public {
    // get the total usd value
    (uint backstop, uint collateral, uint staked) = getUSDValue();
    uint totalUsdValue = backstop.add(collateral);
    // get the USD deposit amount
    uint depositAmountUSD = lpTokenAmount.mul(getLPValue());

    require(feed.getPrice(token0) > 0 && feed.getPrice(token1) > 0, "deposit: price feed is down");
    require(totalUsdValue > 0 || totalSupply() == 0, "deposit: system is rekt");

    // caclulate the share
    uint newShare = PRECISION;
    if(totalSupply() > 0) newShare = totalSupply().mul(depositAmountUSD) / totalUsdValue;

    // deposit
    require(lpToken.transferFrom(msg.sender, address(this), lpTokenAmount), "deposit: transferFrom failed");

    // update LP token
    mint(msg.sender, newShare);

    //stake the LP token for rewards
    lpToken.approve(address(quickswapStaking), lpTokenAmount);
    quickswapStaking.stake(lpTokenAmount);

    emit UserDeposit(msg.sender, lpTokenAmount, newShare);        
  }

  function withdraw(uint shares) public {
    // TODO
  }
}
