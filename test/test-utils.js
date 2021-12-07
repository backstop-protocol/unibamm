const ethers = require('ethers')

const { utils, Contract } = ethers;
const { MaxUint256 } = ethers.constants
const { toBN, fromWei, toWei } = web3.utils

function isWithin99Percent(onePercent, b) {
  return (b.gte(onePercent.mul(toBN(99))) && b.lte(onePercent.mul(toBN(100))))
}

function expandTo18Decimals(n) {
  return toBN(n).mul(toBN(1e18))
}

function expandTo7Decimals(n) {
  return toBN(n).mul(toBN(1e7))
}

function almostTheSame(n1, n2) {
  n1 = Number(web3.utils.fromWei(n1))
  n2 = Number(web3.utils.fromWei(n2))
  //console.log(n1,n2)

  if (n1 * 1000 > n2 * 1001) return false
  if (n2 * 1000 > n1 * 1001) return false
  return true
}

function in100WeiRadius(n1, n2) {
  const x = toBN(n1)
  const y = toBN(n2)

  if (x.add(toBN(100)).lt(y)) return false
  if (y.add(toBN(100)).lt(x)) return false

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

async function mineBlocks(blockNumber) {
  while (blockNumber > 0) {
    blockNumber--;
    //console.log("=-=-", blockNumber)
    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });
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

module.exports = {
  dec, 
  mineBlocks,
  assertRevert,
  in100WeiRadius,
  almostTheSame,
  expandTo18Decimals,
  isWithin99Percent,
  expandTo7Decimals
}