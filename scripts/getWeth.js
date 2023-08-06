const { ethers, getNamedAccounts } = require("hardhat")

const AMOUNT = ethers.utils.parseEther("1")
//"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" 主网weth地址
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

async function getWeth() {
    // 获取签名人账号
    const { deployer } = await getNamedAccounts()
    const weth = await ethers.getContractAt(
        "IWeth", //名称对应合约名称
        WETH_ADDRESS, //主网weth代币地址
        deployer,
    )
    const tx = await weth.deposit({ value: AMOUNT })
    await tx.wait(1) //等待一个区块确认
    const wethBalance = await weth.balanceOf(deployer)
    console.log(
        `Current user : ${deployer} has ${wethBalance.toString()} WETH `,
    )
}
module.exports = { getWeth, AMOUNT, WETH_ADDRESS }
