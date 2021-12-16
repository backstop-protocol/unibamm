const ethers = require('ethers')

const { utils, Contract } = ethers;
const { MaxUint256 } = ethers.constants
const { toBN, fromWei, toWei } = web3.utils

const {
  dec, 
  mineBlocks,
  assertRevert,
  in100WeiRadius,
  almostTheSame,
  expandTo18Decimals,
  isWithin99Percent,
} = require('./test-utils')

//const { deployContract, MockProvider } = require('ethereum-waffle')
//const MockToken = artifacts.require("MockToken")
const UniswapLPManager = artifacts.require("UniswapLPManager")
const UniswapV2Router02 = artifacts.require("UniswapV2Router02")
const ERC20 = artifacts.require("ERC20fix")
const WETH9 = artifacts.require("WETH9")
const StakingRewardsFactory = artifacts.require("StakingRewardsFactory")
// construct
// deploy
const IUniswapV2Pair = artifacts.require("IUniswapV2Pair")
const UniswapV2Library = artifacts.require("UniswapV2Library")
const PriceFeedMock = artifacts.require("PriceFeedMock")
const QuickswapLPManagerWraper = artifacts.require("QuickswapLPManagerWraper")
let UniswapV2Factory;

contract('BAMM', async accounts => {
  const [firstOwner,
    defaulter_1, defaulter_2, defaulter_3,
    whale,
    alice, bob, carol, dennis, erin, flyn,
    A, B, C, D, E, F,
    u1, u2, u3, u4, u5,
    v1, v2, v3, v4, v5,
    frontEnd_1, frontEnd_2, frontEnd_3,
    bammOwner,
    shmuel, yaron, eitan
  ] = accounts;

  // TODO: 
  // init UniswapLPManager with all its prerequisets

  const feePool = "0x1000000000000000000000000000000000000001"
  const owner = "0x2000000000000000000000000000000000000002"
  const totalSupply = expandTo18Decimals(10000)
  const tenthTSup = totalSupply.div(toBN(10))
  let router, pair, tokenA, tokenB, uniswapV2Library, factoryV2, stakingRewardsFactory, uniswapLPManager;

  describe("quickswap", () => {

    before(async () => {
      const { bytecode } = require("@uniswap/v2-core/build/UniswapV2Factory.json")
      UniswapV2Factory = artifacts.require("UniswapV2Factory")
      await overwriteArtifact('UniswapV2Factory', bytecode)
      //console.log(UniswapV2Factory.bytecode === "0x"+bytecode)
      priceFeed = await PriceFeedMock.new()
    })

    beforeEach(async () => {
      uniswapV2Library = await UniswapV2Library.new()
      tokenA = await ERC20.new(totalSupply, { from: bammOwner })
      tokenB = await ERC20.new(totalSupply, { from: bammOwner })
      rewardToken = await ERC20.new(totalSupply, { from: bammOwner })
      const WETH = await WETH9.new()
      factoryV2 = await UniswapV2Factory.new(owner)
      await factoryV2.createPair(tokenA.address, tokenB.address)
      pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
      router = await UniswapV2Router02.new(factoryV2.address, WETH.address)
      pair = await IUniswapV2Pair.at(pairAddress)
      stakingRewardsFactory = await StakingRewardsFactory.new(rewardToken.address, new Date().getTime())
      const duration = 365// days
      await stakingRewardsFactory.deploy(pairAddress, totalSupply, totalSupply)
      const { stakingRewards } = await stakingRewardsFactory.stakingRewardsInfoByStakingToken(pairAddress)
      uniswapLPManager = await QuickswapLPManagerWraper.new(pairAddress, tokenA.address, tokenB.address, priceFeed.address, router.address, stakingRewards)
    })

    it("stakeLP & withdrawLP", async () => {
      await addLiquidity(tenthTSup, tenthTSup)
      const amount = toWei("1")
      const bammBallanceBefore = await pair.balanceOf(uniswapLPManager.address)

      await pair.transfer(uniswapLPManager.address, amount, { from: bammOwner })

      const bammBallanceAfterTransfer = await pair.balanceOf(uniswapLPManager.address)

      await uniswapLPManager.stakeLP({ from: bammOwner })

      const bammBallanceAfterStakeing = await pair.balanceOf(uniswapLPManager.address)
      await mineBlocks(260)
      const withdrawAmount = toBN(amount).div(toBN(2))
      const bammBallanceBeforeWithdraw = await pair.balanceOf(uniswapLPManager.address)
      // bamm amount should be 0 all is staked
      await uniswapLPManager.withdrawLpWrapper(withdrawAmount, { from: bammOwner })
      const bammBallanceAfterWithdraw = await pair.balanceOf(uniswapLPManager.address)

      //console.log("bammBallanceBefore", bammBallanceBefore.toString())
      //console.log("bammBallanceAfterTransfer", bammBallanceAfterTransfer.toString())
      //console.log("bammBallanceAfterStakeing", bammBallanceAfterStakeing.toString())
      //console.log("bammBallanceAfterWithdraw", bammBallanceAfterWithdraw.toString())

      assert.equal(bammBallanceAfterTransfer.toString(), bammBallanceBefore.add(toBN(amount)).toString())
      assert.equal(bammBallanceAfterStakeing.toString(), bammBallanceAfterTransfer.sub(toBN(amount)).toString())
      assert.equal(bammBallanceAfterWithdraw.toString(), bammBallanceBeforeWithdraw.add(withdrawAmount).toString())
    })

    async function addLiquidity(amountA, amountB) {
      const balanceBefore = await pair.balanceOf(bammOwner)
      const tokenABalanceBefore = await tokenA.balanceOf(bammOwner)
      const tokenBBalanceBefore = await tokenB.balanceOf(bammOwner)
      await tokenA.approve(router.address, MaxUint256, { from: bammOwner })
      await tokenB.approve(router.address, MaxUint256, { from: bammOwner })
      await router.addLiquidity(
        tokenA.address,
        tokenB.address,
        amountA,
        amountB,
        amountA,
        amountB,
        bammOwner,
        MaxUint256,
        { from: bammOwner }
      )
      const balanceAfter = await pair.balanceOf(bammOwner)
      const tokenABalanceAfter = await tokenA.balanceOf(bammOwner)
      const tokenBBalanceAfter = await tokenA.balanceOf(bammOwner)
      assert.equal(balanceBefore.toString(), "0")
      assert.isTrue(balanceAfter > balanceBefore)
      assert.equal(tokenABalanceBefore.toString(), totalSupply.toString())
      assert.equal(tokenABalanceAfter.toString(), (totalSupply.sub(tenthTSup)).toString())
      const depositedA = (tokenABalanceBefore.sub(tokenABalanceAfter))
      const depositedB = (tokenBBalanceBefore.sub(tokenBBalanceAfter))
      assert.equal(depositedA.toString(), amountA.toString())
      assert.equal(depositedB.toString(), amountB.toString())
      const pairBalOfA = await tokenA.balanceOf(pair.address)
      const pairBalOfB = await tokenB.balanceOf(pair.address)
      assert.equal(pairBalOfA.toString(), depositedA.toString())
      assert.equal(pairBalOfB.toString(), depositedB.toString())
      return [depositedA, depositedB]
    }

    it("test priceFeed", async () => {
      const price = toWei("12")
      await priceFeed.setPrice(tokenA.address, price)
      const storedPrice = await priceFeed.getPrice(tokenA.address)
      assert.equal(price, storedPrice)
    })

    it("getReserveBalances", async () => {
      const { balance0: balance0Before, balance1: balance1Before } = await uniswapLPManager.getReserveBalances({ from: bammOwner })
      const [providedA, providedB] = await addLiquidity(tenthTSup, tenthTSup)
      const { balance0: balance0After, balance1: balance1After } = await uniswapLPManager.getReserveBalances({ from: bammOwner })
      assert.equal(providedA.toString(), balance0After.sub(balance0Before).toString())
      assert.equal(providedB.toString(), balance1After.sub(balance1Before).toString())
    })

    it("syncAndGetReserveBalances", async () => {
      const { balance0: balance0Before, balance1: balance1Before } = await uniswapLPManager.syncAndGetReserveBalances.call({ from: bammOwner })
      const [providedA, providedB] = await addLiquidity(tenthTSup, tenthTSup)
      const { balance0: balance0After, balance1: balance1After } = await uniswapLPManager.syncAndGetReserveBalances.call({ from: bammOwner })
      assert.equal(providedA.toString(), balance0After.sub(balance0Before).toString())
      assert.equal(providedB.toString(), balance1After.sub(balance1Before).toString())
    })

    it("withdrawToken", async () => {
      const [providedA, providedB] = await addLiquidity(tenthTSup, tenthTSup)
      const amount = toWei("1")
      const bammBallanceBefore = await pair.balanceOf(uniswapLPManager.address)

      await pair.transfer(uniswapLPManager.address, amount, { from: bammOwner })

      const tokenABalanceBefore = await tokenA.balanceOf(uniswapLPManager.address)
      const tokenBBalanceBefore = await tokenB.balanceOf(uniswapLPManager.address)

      const bammBallanceAfterTransfer = await pair.balanceOf(uniswapLPManager.address)

      await uniswapLPManager.stakeLP({ from: bammOwner })
      const bammBallanceAfterStakeing = await pair.balanceOf(uniswapLPManager.address)

      const withdrawAmount = toBN('5000000')
      const bammBallanceBeforeWithdraw = await pair.balanceOf(bammOwner)

      await uniswapLPManager.withdrawTokenWrapper(tokenA.address, withdrawAmount, { from: bammOwner })
      const bammBallanceAfterWithdraw = await pair.balanceOf(bammOwner)

      const tokenABalanceAfter = await tokenA.balanceOf(uniswapLPManager.address)
      const tokenBBalanceAfter = await tokenB.balanceOf(uniswapLPManager.address)

      const withdrawnA = (tokenABalanceAfter.sub(tokenABalanceBefore))
      const withdrawnB = (tokenBBalanceAfter.sub(tokenBBalanceBefore))

      // console.log("withdrawnA", withdrawnA.toString())
      // console.log("withdrawnB", withdrawnB.toString())
      
      assert.equal(withdrawnA.toString(), withdrawAmount.toString()) 
      assert.equal(withdrawnB.toString(), withdrawAmount.toString()) 
    })
  })

})
