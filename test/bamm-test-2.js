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
  expandTo7Decimals
} = require('./test-utils')

//const UniswapLPManager = artifacts.require("UniswapLPManager")
const UniswapV2Router02 = artifacts.require("UniswapV2Router02")
const ERC20 = artifacts.require("ERC20fix")
const ERC201 = artifacts.require("ERC201")
const WETH9 = artifacts.require("WETH9")
const StakingRewardsFactory = artifacts.require("StakingRewardsFactory")

const IUniswapV2Pair = artifacts.require("IUniswapV2Pair")
const UniswapV2Library = artifacts.require("UniswapV2Library")
const PriceFeedMock = artifacts.require("PriceFeedMock")
const BAMM = artifacts.require("BAMM")
let UniswapV2Factory;

contract('BAMM 2', async accounts => {
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
  const totalSupplyB = expandTo7Decimals(10000)
  const tenthTSup = totalSupply.div(toBN(10))
  const tenthTSupB = totalSupplyB.div(toBN(10))
  let router, pair, tokenA, tokenB, uniswapV2Library, factoryV2, stakingRewardsFactory, bammInstance;

  describe("bamm", () => {

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
      tokenB = await ERC201.new(totalSupplyB, { from: bammOwner })
      const airdrops = [alice, bob, carol].map(async account => {
        await tokenA.transfer(account, tenthTSup, { from: bammOwner })
        await tokenB.transfer(account, tenthTSupB, { from: bammOwner })
      })
      await Promise.all(airdrops)
      collateralToken = await ERC20.new(totalSupply, { from: bammOwner })
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
      bammInstance = await BAMM.new(pairAddress, tokenA.address, tokenB.address, priceFeed.address, router.address, stakingRewards, collateralToken.address, priceFeed.address, rewardToken.address)
    })

    it.only('getUSDValue', async () => {
      await addLiquidity(tenthTSup, tenthTSupB.mul(toBN(2)))
      const tokenBPrice = toWei("10")
      await priceFeed.setPrice(tokenB.address, tokenBPrice)
      const tokenAPrice = toWei("20")
      await priceFeed.setPrice(tokenA.address, tokenAPrice)
      const userLpBal = await pair.balanceOf(bammOwner)
      await pair.transfer(bammInstance.address, userLpBal, { from: bammOwner })
      await bammInstance.stakeLP({ from: bammOwner })
      const {backstop} = await bammInstance.getUSDValue.call()
      console.log("totalUsdValue", backstop.toString())
      const expectedUsdValue = (tenthTSup.mul(toBN(tokenAPrice))).add(tenthTSup.mul(toBN(tokenBPrice)).mul(toBN("2")))
      assert(backstop.toString(), expectedUsdValue.toString())
      // transfer some token A & B
      await tokenA.transfer(bammInstance.address, toWei("1"), { from: bammOwner })
      await tokenB.transfer(bammInstance.address, dec("9", 7), { from: bammOwner })
      const {backstop: backstopUsdVal} = await bammInstance.getUSDValue.call()
      const newExpectedUsdValue = toWei("4110")
      assert(backstopUsdVal.toString(), newExpectedUsdValue)
    })

    it.only("deposit", async () => {
      // TODO:
      // 3 users each one deposit different amounts
      // to check: 
      // user share totalSupply and token are really staked out
      // check in the staking module the bamm balance is
      await addLiquidity(tenthTSup, tenthTSupB, alice)
      const userLpBal = await pair.balanceOf(alice)

      console.log("alice", alice)
      console.log("userLpBal", userLpBal.toString())
      await pair.approve(bammInstance.address, MaxUint256, { from: alice })
      await bammInstance.deposit(userLpBal, { from: alice })

      const userLpBalAfter = await pair.balanceOf(alice)
      assert.isTrue(userLpBal.gt(userLpBalAfter))
      const userShare = await bammInstance.balanceOf(bammOwner)
      // const totaSahre = xxx
      // assert.equal(userShare, totaSahre)
    })

    it("stakeLP & withdrawLP", async () => {
      await addLiquidity(tenthTSup, tenthTSup)
      const amount = toWei("1")
      const bammBallanceBefore = await pair.balanceOf(bammInstance.address)

      await pair.transfer(bammInstance.address, amount, { from: bammOwner })

      const bammBallanceAfterTransfer = await pair.balanceOf(bammInstance.address)

      await bammInstance.stakeLP({ from: bammOwner })

      const bammBallanceAfterStakeing = await pair.balanceOf(bammInstance.address)
      await mineBlocks(260)
      const withdrawAmount = toBN(amount).div(toBN(2))
      const bammBallanceBeforeWithdraw = await pair.balanceOf(bammInstance.address)
      // bamm amount should be 0 all is staked
      await bammInstance.withdrawLpWrapper(withdrawAmount, { from: bammOwner })
      const bammBallanceAfterWithdraw = await pair.balanceOf(bammInstance.address)

      //console.log("bammBallanceBefore", bammBallanceBefore.toString())
      //console.log("bammBallanceAfterTransfer", bammBallanceAfterTransfer.toString())
      //console.log("bammBallanceAfterStakeing", bammBallanceAfterStakeing.toString())
      //console.log("bammBallanceAfterWithdraw", bammBallanceAfterWithdraw.toString())

      assert.equal(bammBallanceAfterTransfer.toString(), bammBallanceBefore.add(toBN(amount)).toString())
      assert.equal(bammBallanceAfterStakeing.toString(), bammBallanceAfterTransfer.sub(toBN(amount)).toString())
      assert.equal(bammBallanceAfterWithdraw.toString(), bammBallanceBeforeWithdraw.add(withdrawAmount).toString())
    })

    async function addLiquidity(amountA, amountB, owner = bammOwner) {
      const balanceBefore = await pair.balanceOf(owner)
      const tokenABalanceBefore = await tokenA.balanceOf(owner)
      const tokenBBalanceBefore = await tokenB.balanceOf(owner)
      await tokenA.approve(router.address, MaxUint256, { from: owner })
      await tokenB.approve(router.address, MaxUint256, { from: owner })
      await router.addLiquidity(
        tokenA.address,
        tokenB.address,
        amountA,
        amountB,
        amountA,
        amountB,
        owner,
        MaxUint256,
        { from: owner }
      )
      const balanceAfter = await pair.balanceOf(owner)
      const tokenABalanceAfter = await tokenA.balanceOf(owner)
      const tokenBBalanceAfter = await tokenB.balanceOf(owner)
      assert.equal(balanceBefore.toString(), "0")
      //assert.isTrue(balanceAfter > balanceBefore)
      assert.equal(tokenABalanceAfter.toString(), (tokenABalanceBefore.sub(amountA)).toString())
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
      const { balance0: balance0Before, balance1: balance1Before } = await bammInstance.getReserveBalances({ from: bammOwner })
      const [providedA, providedB] = await addLiquidity(tenthTSup, tenthTSup)
      const { balance0: balance0After, balance1: balance1After } = await bammInstance.getReserveBalances({ from: bammOwner })
      assert.equal(providedA.toString(), balance0After.sub(balance0Before).toString())
      assert.equal(providedB.toString(), balance1After.sub(balance1Before).toString())
    })

    it("syncAndGetReserveBalances", async () => {
      const { balance0: balance0Before, balance1: balance1Before } = await bammInstance.syncAndGetReserveBalances.call({ from: bammOwner })
      const [providedA, providedB] = await addLiquidity(tenthTSup, tenthTSup)
      const { balance0: balance0After, balance1: balance1After } = await bammInstance.syncAndGetReserveBalances.call({ from: bammOwner })
      assert.equal(providedA.toString(), balance0After.sub(balance0Before).toString())
      assert.equal(providedB.toString(), balance1After.sub(balance1Before).toString())
    })

    it("withdrawToken", async () => {
      const [providedA, providedB] = await addLiquidity(tenthTSup, tenthTSup)
      const amount = toWei("1")
      const bammBallanceBefore = await pair.balanceOf(bammInstance.address)

      await pair.transfer(bammInstance.address, amount, { from: bammOwner })

      const tokenABalanceBefore = await tokenA.balanceOf(bammInstance.address)
      const tokenBBalanceBefore = await tokenB.balanceOf(bammInstance.address)

      const bammBallanceAfterTransfer = await pair.balanceOf(bammInstance.address)

      await bammInstance.stakeLP({ from: bammOwner })
      const bammBallanceAfterStakeing = await pair.balanceOf(bammInstance.address)

      const withdrawAmount = toBN('5000000')
      const bammBallanceBeforeWithdraw = await pair.balanceOf(bammOwner)

      await bammInstance.withdrawTokenWrapper(tokenA.address, withdrawAmount, { from: bammOwner })
      const bammBallanceAfterWithdraw = await pair.balanceOf(bammOwner)

      const tokenABalanceAfter = await tokenA.balanceOf(bammInstance.address)
      const tokenBBalanceAfter = await tokenB.balanceOf(bammInstance.address)

      const withdrawnA = (tokenABalanceAfter.sub(tokenABalanceBefore))
      const withdrawnB = (tokenBBalanceAfter.sub(tokenBBalanceBefore))

      // console.log("withdrawnA", withdrawnA.toString())
      // console.log("withdrawnB", withdrawnB.toString())
      
      assert.equal(withdrawnA.toString(), withdrawAmount.toString()) 
      assert.equal(withdrawnB.toString(), withdrawAmount.toString()) 
    })
  })
})