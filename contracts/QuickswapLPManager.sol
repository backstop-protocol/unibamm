//SPDX-License-Identifier: Unlicense
pragma solidity =0.6.6;

import '@uniswap/lib/contracts/libraries/TransferHelper.sol';
import '@uniswap/v2-periphery/contracts/UniswapV2Router02.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IERC20.sol';
import '@uniswap/v2-periphery/contracts/libraries/SafeMath.sol';

interface IQuickswapStakingRewards {
  function stake(uint256 amount) external;
  function withdraw(uint256 amount) external;
  function getReward() external;
}

interface PriceFeed {
  function getPrice(IERC20 token) external view returns(uint);
}

contract UniswapLPManager {
  using SafeMath for uint;

  IERC20 immutable public lpToken;
  IERC20 immutable public token0;
  IERC20 immutable public token1;
  PriceFeed immutable public feed;
  UniswapV2Router02 immutable public uniRouter;
  IQuickswapStakingRewards immutable public quickswapStaking;

  constructor(
    IERC20 _lpToken,
    IERC20 _token0,
    IERC20 _token1,
    PriceFeed _feed,
    UniswapV2Router02 _uniRouter,
    IQuickswapStakingRewards _quickswapStaking
  )
    public
  {
    lpToken = _lpToken;
    token0 = _token0;
    token1 = _token1;
    feed = _feed;
    uniRouter = _uniRouter;
    quickswapStaking = _quickswapStaking;
    _lpToken.approve(address(_uniRouter), uint (-1));
  }

  // callable by anyone
  function stakeLP() public {
    // give allowance every time as gas in polygon is cheap
    uint amount = IERC20(lpToken).balanceOf(address(this));
    require(lpToken.approve(address(quickswapStaking), amount), "stakeLP: approve failed");
    quickswapStaking.stake(amount);
  }

  function withdrawLP(uint lpAmount) internal {
    quickswapStaking.withdraw(lpAmount);
    quickswapStaking.getReward();    
  }

  function getReserveBalances() public view returns(uint balance0, uint balance1) {
    (uint112 bal0, uint112 bal1, ) = IUniswapV2Pair(address(lpToken)).getReserves();

    balance0 = uint(bal0);
    balance1 = uint(bal1);    
  }

  function syncAndGetReserveBalances() public returns(uint balance0, uint balance1) {
    IUniswapV2Pair(address(lpToken)).sync();
    return getReserveBalances();
  }

  function withdrawToken(IERC20 token, uint amount) internal {
    (uint bal0, uint bal1) = syncAndGetReserveBalances();

    uint bal = 0;
    if(token == token0) bal = bal0;
    else if(token == token1) bal = bal1;
    else revert("withdrawToken: invalid token");

    uint lpAmount = amount.mul(lpToken.totalSupply()) / bal; // TODO roundup

    uint min0 = bal0.mul(lpAmount) / lpToken.totalSupply(); // TODO - do not read balances directly, use get reserve
    uint min1 = bal1.mul(lpAmount) / lpToken.totalSupply();    

    withdrawLP(lpAmount);
    uniRouter.removeLiquidity(address(token0), address(token1), lpAmount, min0, min1, address(this), block.timestamp);
  }

  function getTokenBalance(IERC20 token) public returns(uint) {
    (uint bal0, uint bal1) = syncAndGetReserveBalances();
    uint bal = 0;
    if(token == token0) bal = bal0;
    else if(token == token1) bal = bal1;
    // else bal = 0

    return bal.mul(getLPBalance()) / lpToken.totalSupply();
  }

  // callable by anyone
  event InventoryDeposit(uint amount0, uint amount1);
  function depositInventory() public {
    (uint bal0, uint bal1) = syncAndGetReserveBalances();

    // 1. check that reserve was not maipulated
    uint value0 = bal0.mul(feed.getPrice(token0));
    uint value1 = bal1.mul(feed.getPrice(token1));

    if(value0.mul(100) / value1 > 102 || value1.mul(100) / value0 > 102) { // TODO - what is the loss for 2% deviation?
      emit InventoryDeposit(0, 0);
      return;
    }

    // 2. calc token0 and token1 amounts
    uint amount0 = token0.balanceOf(address(this));
    uint amount1 = token1.balanceOf(address(this));

    if(amount0.mul(bal1) > amount1.mul(bal0)) {
      // amount0 / amount1 > uniswap ratio => too much amount0
      amount0 = amount1.mul(bal0) / bal1;
    }
    else {
      // amount0 / amount1 < uniswap ratio => too much amount1
      amount1 = amount0.mul(bal1) / bal0;      
    }

    // 3. give allowance
    uint allowance0 = amount0.mul(11) / 10;
    uint allowance1 = amount1.mul(11) / 10;

    require(token0.approve(address(lpToken), allowance0), "depositInventory: token0 approve failed");
    require(token1.approve(address(lpToken), allowance1), "depositInventory: token1 approve failed");

    // 4. call add liquidity
    uint min0 = amount0 - 1;
    uint min1 = amount1 - 1;    

    uniRouter.addLiquidity(address(token0), address(token1), amount0, amount1, min0, min1, address(this), block.timestamp);

    // 5. reset allowance
    require(token0.approve(address(lpToken), 0), "depositInventory: token0 approve failed");
    require(token1.approve(address(lpToken), 0), "depositInventory: token1 approve failed");

    // 6. stake the LP
    stakeLP();
  }

    // FROM https://github.com/abdk-consulting/abdk-libraries-solidity/blob/16d7e1dd8628dfa2f88d5dadab731df7ada70bdd/ABDKMath64x64.sol#L687
  function sqrt (uint _x) public pure returns (uint) {
    if (_x == 0) return 0;
    else {
      uint xx = _x;
      uint r = 1;
      if (xx >= 0x100000000000000000000000000000000) { xx >>= 128; r <<= 64; }
      if (xx >= 0x10000000000000000) { xx >>= 64; r <<= 32; }
      if (xx >= 0x100000000) { xx >>= 32; r <<= 16; }
      if (xx >= 0x10000) { xx >>= 16; r <<= 8; }
      if (xx >= 0x100) { xx >>= 8; r <<= 4; }
      if (xx >= 0x10) { xx >>= 4; r <<= 2; }
      if (xx >= 0x8) { r <<= 1; }
      r = (r.add(_x) / r) >> 1;
      r = (r.add(_x) / r) >> 1;
      r = (r.add(_x) / r) >> 1;
      r = (r.add(_x) / r) >> 1;
      r = (r.add(_x) / r) >> 1;
      r = (r.add(_x) / r) >> 1;
      r = (r.add(_x) / r) >> 1; // Seven iterations should be enough
      uint r1 = _x / r;
      return (r < r1 ? r : r1);
    }
  }

  function getLPValue() public returns(uint) {
    uint unit0 = token0.decimals();
    uint unit1 = token1.decimals();

    (uint balance0, uint balance1) = syncAndGetReserveBalances();    

    uint value0 = balance0.mul(feed.getPrice(token0)) / (uint(10) ** unit0);
    uint value1 = balance1.mul(feed.getPrice(token1)) / (uint(10) ** unit1);

    return sqrt(value0.mul(value1)).mul(2).mul(uint(10) ** lpToken.decimals()) / lpToken.totalSupply();
  }

  function getLPBalance() public view returns(uint) {
    return IERC20(address(quickswapStaking)).balanceOf(address(this));
  }

  function getUSDBalance() public returns(uint) {
    uint lpBalance = getLPBalance();
    uint value0 = token0.balanceOf(address(this)).mul(feed.getPrice(token0)) / (uint(10) ** token0.decimals());
    uint value1 = token1.balanceOf(address(this)).mul(feed.getPrice(token1)) / (uint(10) ** token1.decimals());

    return lpBalance.mul(getLPValue()).add(value0).add(value1);
  }

  function getSwapReturn(IERC20 src, uint srcAmount, IERC20 dest) public view returns(uint) {
    // don't sell, as deposit inventory should be called first
    if(dest.balanceOf(address(this)) != 0) return 0;

    // don't sell over half the inventory as the other half will be used for inventory deposit
    if(src.balanceOf(address(this)) < srcAmount.mul(2)) return 0;

    return srcAmount.mul(feed.getPrice(token0)) / feed.getPrice(token1);
  }

  function inventorySwap(IERC20 src, uint srcAmount, IERC20 dest, uint minDestAmount ) public {
    uint destAmount = getSwapReturn(src, srcAmount, dest);
    require(destAmount >= minDestAmount, "inventorySwap: insufficient destAmount");

    TransferHelper.safeTransferFrom(address(src), msg.sender, address(this), srcAmount);
    TransferHelper.safeTransfer(address(src), msg.sender, destAmount);

    // try to deposit and stake the LP (might fail if quickswap pool was manipulated)
    depositInventory();
  }

  fallback() external {

  }
}
