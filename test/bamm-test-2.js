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
const StakingRewards = artifacts.require("StakingRewards")

const IUniswapV2Pair = artifacts.require("IUniswapV2Pair")
const UniswapV2Library = artifacts.require("UniswapV2Library")
const PriceFeedMock = artifacts.require("PriceFeedMock")
const BAMM = artifacts.require("BAMM")
let UniswapV2Factory;

const half = bn => bn.div(toBN(2))

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
  let collateralToken, rewardToken, router, pair, tokenA, tokenB, uniswapV2Library, factoryV2, stakingRewardsFactory, bammInstance, stakingRewards;

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
      const tokenBPrice = toWei("10")
      await priceFeed.setPrice(tokenB.address, tokenBPrice)
      const tokenAPrice = toWei("20")
      await priceFeed.setPrice(tokenA.address, tokenAPrice) 
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
      const { stakingRewards: stakingRewardsAddress } = (await stakingRewardsFactory.stakingRewardsInfoByStakingToken(pairAddress))
      stakingRewards = await StakingRewards.at(stakingRewardsAddress)
      bammInstance = await BAMM.new(pairAddress, tokenA.address, tokenB.address, priceFeed.address, router.address, stakingRewardsAddress, collateralToken.address, priceFeed.address, rewardToken.address)
    })

    it("getLPValue", async ()=> {
      await addLiquidity(tenthTSup, tenthTSupB.mul(toBN(2)))
      const lpValue = await bammInstance.getLPValue.call()
      assert.equal(lpValue.toString(), "4735058123106523924131869")
    })

    it('getUSDValue', async () => {
      await addLiquidity(tenthTSup, tenthTSupB.mul(toBN(2)))
      const userLpBal = await pair.balanceOf(bammOwner)
      await pair.transfer(bammInstance.address, userLpBal, { from: bammOwner })
      await bammInstance.stakeLP({ from: bammOwner })
      const {backstop} = await bammInstance.getUSDValue.call()
      const expectedUsdValue = (tenthTSup.mul(toBN(tokenAPrice))).add(tenthTSup.mul(toBN(tokenBPrice)).mul(toBN("2")))
      assert(backstop.toString(), expectedUsdValue.toString())
      // transfer some token A & B
      await tokenA.transfer(bammInstance.address, toWei("1"), { from: bammOwner })
      await tokenB.transfer(bammInstance.address, dec("9", 7), { from: bammOwner })
      const {backstop: backstopUsdVal} = await bammInstance.getUSDValue.call()
      const newExpectedUsdValue = toWei("4110")
      assert(backstopUsdVal.toString(), newExpectedUsdValue)
    })

    it("deposit", async () => {
      await addLiquidity(tenthTSup, tenthTSupB, alice)
      const aliceLpBalBefore = await pair.balanceOf(alice)
      await pair.approve(bammInstance.address, MaxUint256, { from: alice })
      await bammInstance.deposit(aliceLpBalBefore, { from: alice })

      const aliceLpBalAfter = await pair.balanceOf(alice)
      assert.isTrue(aliceLpBalBefore.gt(aliceLpBalAfter))
      assert.equal(aliceLpBalAfter.toString(), "0") // all LP deposited

      // checking user share
      const aliceShare = await bammInstance.balanceOf(alice)
      const totalSupply = await bammInstance.totalSupply()
      assert.equal(aliceShare.toString(), totalSupply.toString())  // alice is the only depositer
      
      // checking staking
      const stakedAmount = await stakingRewards.balanceOf(bammInstance.address)
      assert.equal(stakedAmount.toString(), aliceLpBalBefore.toString()) // all of the original LP deposit is staked
 
      await addLiquidity(half(tenthTSup), half(tenthTSupB), bob)
      const bobLpBalBefore = await pair.balanceOf(bob)

      await pair.approve(bammInstance.address, MaxUint256, { from: bob })
      await bammInstance.deposit(bobLpBalBefore, { from: bob })

      const bobLpBalAfter = await pair.balanceOf(bob)

      // checking user share
      const bobShare = await bammInstance.balanceOf(bob)
      const totalSupply_2 = await bammInstance.totalSupply()
      assert.equal(bobShare.add(aliceShare).toString(), totalSupply_2.toString())  // alice & bob are the only depositers

      // checking staking
      const stakedAmount_2 = await stakingRewards.balanceOf(bammInstance.address)
      assert.equal(stakedAmount_2.toString(), aliceLpBalBefore.add(bobLpBalBefore).toString()) // all of bobs & alice LP deposit is staked

      const aQurterOf = bn => half(half(bn))
      // carol
      await addLiquidity(aQurterOf(tenthTSup), aQurterOf(tenthTSupB), carol)
      const carolLpBalBefore = await pair.balanceOf(carol)

      await pair.approve(bammInstance.address, MaxUint256, { from: carol })
      await bammInstance.deposit(carolLpBalBefore, { from: carol })

      const carolLpBalAfter = await pair.balanceOf(carol)

      // checking user share
      const carolShare = await bammInstance.balanceOf(carol)
      const totalSupply_3 = await bammInstance.totalSupply()
      assert.equal(bobShare.add(carolShare).add(aliceShare).toString(), totalSupply_3.toString())  // alice & bob are the only depositers

      // checking staking
      const stakedAmount_3 = await stakingRewards.balanceOf(bammInstance.address)
      assert.equal(stakedAmount_3.toString(), aliceLpBalBefore.add(bobLpBalBefore).add(carolLpBalBefore).toString()) // all of bobs & alice LP deposit is staked
    })

    it.only("withdraw", async () => {
      await addLiquidity(tenthTSup, tenthTSupB, alice)

      await pair.approve(bammInstance.address, MaxUint256, { from: alice })
      const depositAmount = toBN("3162277660167379")
      await bammInstance.deposit(depositAmount, { from: alice })
      
      // TODO: transfers to the unibamm to simulate a not fully rebalanced state
      const transferAmount = toBN("72634552")
      await tokenA.transfer(bammInstance.address, transferAmount, {from: bammOwner})
      await tokenB.transfer(bammInstance.address, transferAmount, {from: bammOwner})
      await collateralToken.transfer(bammInstance.address, transferAmount, {from: bammOwner})
      await rewardToken.transfer(bammInstance.address, transferAmount, {from: bammOwner})

      const aliceLpBalBefore = await pair.balanceOf(alice)
      const aliceShareBefore = await bammInstance.balanceOf(alice)
      const totalSupplyBefore = await bammInstance.totalSupply()

      const aliceTokenABefore = await tokenA.balanceOf(alice)
      const aliceTokenBBefore = await tokenB.balanceOf(alice)

      const aliceCollateralTokenBefore = await collateralToken.balanceOf(alice)
      const rewardTokenBefore = await rewardToken.balanceOf(alice)

      const withdrawAmount = half(aliceShareBefore)
      await bammInstance.withdraw(withdrawAmount, { from: alice })
      
      const aliceLpBalAfter = await pair.balanceOf(alice)
      const aliceShareAfter = await bammInstance.balanceOf(alice)
      const totalSupplyAfter = await bammInstance.totalSupply()

      const aliceTokenAAfter = await tokenA.balanceOf(alice)
      const aliceTokenBAfter = await tokenB.balanceOf(alice)

      const aliceCollateralTokenAfter = await collateralToken.balanceOf(alice)
      const aliceRewardTokenAfter = await rewardToken.balanceOf(alice)

      assert.equal(aliceShareAfter.toString(), half(aliceShareBefore).toString())
      assert.equal(aliceLpBalAfter.toString(), half(depositAmount).toString())
      assert.equal(totalSupplyAfter.toString(), half(totalSupplyBefore).toString())

      // TODO: check all other tokens
      assert.equal(aliceTokenAAfter.toString(), aliceTokenABefore.add(half(transferAmount)).toString())
      assert.equal(aliceTokenBAfter.toString(), aliceTokenBBefore.add(half(transferAmount)).toString())
      assert.equal(aliceCollateralTokenAfter.toString(), aliceCollateralTokenBefore.add(half(transferAmount)).toString())

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
      const pairBalOfABefore = await tokenA.balanceOf(pair.address)
      const pairBalOfBBefore = await tokenB.balanceOf(pair.address)
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
      const pairBalOfAAfter = await tokenA.balanceOf(pair.address)
      const pairBalOfBAfter = await tokenB.balanceOf(pair.address)

      assert.equal(pairBalOfABefore.add(depositedA).toString(), pairBalOfAAfter.toString())
      assert.equal(pairBalOfBBefore.add(depositedB).toString(), pairBalOfBAfter.toString())
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