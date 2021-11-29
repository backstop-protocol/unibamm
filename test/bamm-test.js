const ethers = require('ethers')

const { utils, Contract } = ethers;
const { MaxUint256 } = ethers.constants
const { toBN, fromWei, toWei } = web3.utils

const MINIMUM_LIQUIDITY = toBN(10).pow(toBN(3))
//const { deployContract, MockProvider } = require('ethereum-waffle')
//const MockToken = artifacts.require("MockToken")
const UniswapLPManager = artifacts.require("UniswapLPManager")
const UniswapV2Router02 = artifacts.require("UniswapV2Router02")
const DeflatingERC20 = artifacts.require("DeflatingERC20")
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
 
  describe("quickswap", ()=> {

    before(async ()=>{
      const {bytecode} = require("/Users/shmuel/Documents/projects/unibam2/node_modules/@uniswap/v2-core/build/UniswapV2Factory.json")
      UniswapV2Factory = artifacts.require("UniswapV2Factory")
      await overwriteArtifact('UniswapV2Factory', bytecode)
      //console.log(UniswapV2Factory.bytecode === "0x"+bytecode)
      priceFeed = await PriceFeedMock.new()
    })

    beforeEach(async ()=> {
      uniswapV2Library = await UniswapV2Library.new()
      tokenA = await DeflatingERC20.new(totalSupply, {from: bammOwner})
      tokenB = await DeflatingERC20.new(totalSupply, {from: bammOwner})
      rewardToken = await DeflatingERC20.new(totalSupply, {from: bammOwner})
      const WETH = await WETH9.new()
      factoryV2 = await UniswapV2Factory.new(owner)
      await factoryV2.createPair(tokenA.address, tokenB.address)
      pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
      router = await UniswapV2Router02.new(factoryV2.address, WETH.address)
      pair = await IUniswapV2Pair.at(pairAddress)
      stakingRewardsFactory = await StakingRewardsFactory.new(rewardToken.address, new Date().getTime())
      const duration = 365// days
      await stakingRewardsFactory.deploy(pairAddress, totalSupply, totalSupply)
      const {stakingRewards} = await stakingRewardsFactory.stakingRewardsInfoByStakingToken(pairAddress)
      uniswapLPManager = await QuickswapLPManagerWraper.new(pairAddress, tokenA.address, tokenB.address, priceFeed.address, router.address, stakingRewards)
    }) 

    it("stakeLP & withdrawLP", async ()=>{
      await addLiquidity(tenthTSup, tenthTSup)
      const amount = toWei("1")
      const lpTokenBalanceBefore = await pair.balanceOf(bammOwner)
      const rewardTokenBalanceBefore = await rewardToken.balanceOf(bammOwner)
      //console.log(amount.toString())

      await pair.transfer(uniswapLPManager.address, amount, {from: bammOwner})
      await uniswapLPManager.stakeLP({from: bammOwner})
      // bamm amount should be 0 all is staked
      await uniswapLPManager.withdrawLpWrapper(amount, {from: bammOwner})
      const lpTokenBalanceAfter = await pair.balanceOf(bammOwner)
      // bamm amount should be back to the transfer amount
      const rewardTokenBalanceAfter =  await rewardToken.balanceOf(bammOwner)
      //console.log(rewardTokenBalanceAfter.toString())
      //console.log(rewardTokenBalanceBefore.toString())
      assert.isTrue(rewardTokenBalanceAfter.gt(rewardTokenBalanceBefore))// this is failing because not much time passed to accumilate reward
      assert.equal(lpTokenBalanceBefore.toString(), lpTokenBalanceAfter.toString())// this is failing becuse its unstaked the amount and actualy transferd it
    })

    async function addLiquidity(amountA, amountB) {
      const balanceBefore = await pair.balanceOf(bammOwner)
      const tokenABalanceBefore = await tokenA.balanceOf(bammOwner)
      const tokenBBalanceBefore = await tokenB.balanceOf(bammOwner)
      await tokenA.approve(router.address, MaxUint256, {from: bammOwner})
      await tokenB.approve(router.address, MaxUint256, {from: bammOwner})
      await router.addLiquidity(
        tokenA.address,
        tokenB.address,
        amountA,
        amountB,
        amountA,
        amountB,
        bammOwner,
        MaxUint256,
        {from: bammOwner}
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
      return [depositedA, depositedB]
    }

    it("test priceFeed", async () => {
      const price = toWei("12")
      await priceFeed.setPrice(tokenA.address, price)
      const storedPrice = await priceFeed.getPrice(tokenA.address)
      assert.equal(price, storedPrice)
    })

    it("getReserveBalances", async () => {
      const {balance0: balance0Before, balance1: balance1Before} = await uniswapLPManager.getReserveBalances({from: bammOwner})
      await addLiquidity(tenthTSup, tenthTSup)
      const {balance0: balance0After, balance1: balance1After} = await uniswapLPManager.getReserveBalances({from: bammOwner})
      assert.isTrue(balance0After.gt(balance0Before))
      assert.isTrue(balance1After.gt(balance1Before))
    })

    it("syncAndGetReserveBalances", async () => {
      const {balance0: balance0Before, balance1: balance1Before} = await uniswapLPManager.syncAndGetReserveBalances.call({from: bammOwner})
      await addLiquidity(tenthTSup, tenthTSup)
      const {balance0: balance0After, balance1: balance1After} = await uniswapLPManager.syncAndGetReserveBalances.call({from: bammOwner})
      assert.isTrue(balance0After.gt(balance0Before))
      assert.isTrue(balance1After.gt(balance1Before))
    })

    it("withdrawToken", async ()=> {
      console.log()
      const [providedA, providedB] = await addLiquidity(tenthTSup, tenthTSup)
      const lpTokenBalanceBefore = await pair.balanceOf(bammOwner)
      const tokenABalanceBefore = await tokenA.balanceOf(bammOwner)
      const lpTokenAmount = lpTokenBalanceBefore.div(toBN(2))
      console.log("lpTokenAmount", lpTokenAmount.toString())
      const tokenAWithdrawAmount = tenthTSup.div(toBN(4))

      await pair.approve(uniswapLPManager.address, MaxUint256, {from: bammOwner})

      await pair.transfer(uniswapLPManager.address, lpTokenAmount, {from: bammOwner})
      await uniswapLPManager.stakeLP({from: bammOwner})
      console.log("1 iteration")
      await uniswapLPManager.withdrawTokenWrapper(tokenA.address, tokenAWithdrawAmount, {from: bammOwner})
      console.log("2 iteration")

      const lpTokenBalanceAfter = await pair.balanceOf(bammOwner)
      const tokenABalanceAfter = await tokenA.balanceOf(bammOwner)
      console.log(lpTokenBalanceBefore.toString())
      console.log(lpTokenBalanceAfter.toString())
      //assert.isTrue(lpTokenBalanceBefore.gt(lpTokenBalanceAfter))
      assert.equal(tokenABalanceBefore.add(amount).toString(), tokenABalanceAfter.toString())
    })


/* 
    
    it("pull liquidity out", async ()=>{
      await tokenA.approve(router.address, MaxUint256, {from: bammOwner})
      await tokenB.approve(router.address, MaxUint256, {from: bammOwner})
      const tenthTSup = totalSupply.div(toBN(10))
      await router.addLiquidity(
        tokenA.address,
        tokenB.address,
        tenthTSup,
        tenthTSup,
        tenthTSup,
        tenthTSup,
        bammOwner,
        MaxUint256,
        {from: bammOwner}
      )
      const lpBalanceBefore = await pair.balanceOf(bammOwner)

      const lpBalanceAfter = await pair.balanceOf(bammOwner)
      assert.equal(lpBalanceAfter.toString(), "0")
    })
     */
  })

})

function isWithin99Percent (onePercent, b) {
  return (b.gte(onePercent.mul(toBN(99))) && b.lte(onePercent.mul(toBN(100))))
}

function expandTo18Decimals(n) {
  return toBN(n).mul(toBN(1e18))
}


function almostTheSame(n1, n2) {
  n1 = Number(web3.utils.fromWei(n1))
  n2 = Number(web3.utils.fromWei(n2))
  //console.log(n1,n2)

  if(n1 * 1000 > n2 * 1001) return false
  if(n2 * 1000 > n1 * 1001) return false  
  return true
}

function in100WeiRadius(n1, n2) {
  const x = toBN(n1)
  const y = toBN(n2)

  if(x.add(toBN(100)).lt(y)) return false
  if(y.add(toBN(100)).lt(x)) return false  
 
  return true
}

async function assertRevert(txPromise, message = undefined) {
  try {
    const tx = await txPromise
    // console.log("tx succeeded")
    assert.isFalse(tx.receipt.status) // when this assert fails, the expected revert didn't occur, i.e. the tx succeeded
  } catch (err) {
    // console.log("tx failed")
    assert.include(err.message, "revert")
    
    if (message) {
       assert.include(err.message, message)
    }
  }
}

function dec(val, scale) {
  let zerosCount

  if (scale == 'ether') {
    zerosCount = 18
  } else if (scale == 'finney')
    zerosCount = 15
  else {
    zerosCount = scale
  }

  const strVal = val.toString()
  const strZeros = ('0').repeat(zerosCount)

  return strVal.concat(strZeros)
}