const { getWeth, AMOUNT, WETH_ADDRESS } = require("../scripts/getWeth")
const { ethers, getNamedAccounts } = require("hardhat")

async function main() {
    console.log("########################Deposit########################")
    //获取Weth
    await getWeth()
    const { deployer } = await getNamedAccounts()
    const lendingPool = await getLendingPool(deployer)
    //Deposit 设定进行抵押的金额

    await approveWethDeposit(
        WETH_ADDRESS,
        deployer,
        AMOUNT,
        lendingPool.address,
    )
    console.log("Depositing...")

    /**
     *  1.代币地址 WETH_ADDRESS
     *  2.质押金额 AMOUNT
     *  3.质押人地址 deployer
     *  4.是否是本人操作 如果是本人操作选择 ‘0’
     */
    const tx = await lendingPool.deposit(WETH_ADDRESS, AMOUNT, deployer, 0)
    tx.wait(1)
    console.log("Deposited")

    console.log("########################Borrow########################")
    /***
     * 获取当前签名账号在抵押池中的信息,
     * availableBorrowsETH ，抵押池中可借出金额，
     * totalDebtETH 抵押池中债务金额
     * */
    const { availableBorrowsETH } = await getUserAccountData(
        lendingPool,
        deployer,
    )

    //当前一个以太坊可以兑换的dai的数量
    const daiPrice = await getDaiPrice()
    // 0.9：这个数字表示一个保守的借款比例
    const amountDaiToBorrow =
        availableBorrowsETH.toString() * 0.9 * (1 / daiPrice.toNumber())

    console.log(`You can borrow ${amountDaiToBorrow} DAI`)

    //换算成18位的DAI的数量
    const amountDaiToBorrowWei = ethers.utils.parseEther(
        amountDaiToBorrow.toString(),
    )
    console.log(`You can borrow ${amountDaiToBorrowWei} DAI WEI`)

    //主网地址 "0x6B175474E89094C44Da98b954EedeAC495271d0F" 可以在aave官网查看支持的稳定币
    const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F"

    //以eth抵押借款DAI
    await borrowDai(lendingPool, deployer, amountDaiToBorrowWei, daiAddress)

    //再次查询借款池的数据信息
    await getUserAccountData(lendingPool, deployer)

    console.log("########################Repay########################")

    //抵押偿还
    await repay(lendingPool, deployer, amountDaiToBorrowWei, daiAddress)

    //再次查询借款池的数据信息
    await getUserAccountData(lendingPool, deployer)
}

async function repay(lendingPool, singer, amountDaiToBorrowWei, daiAddress) {
    // 向贷款池转入对应的DAI币进行偿还
    await approveWethDeposit(
        daiAddress,
        singer,
        amountDaiToBorrowWei,
        lendingPool.address,
    )
    /**
     * asset 上次借款的资产地址
     * amount 还款金额
     * rateMode 贷款模式 1 for Stable, 2 for Variable
     * onBehalfOf 接收贷款款项的人
     */
    const tx = await lendingPool.repay(
        daiAddress,
        amountDaiToBorrowWei.toString(),
        1,
        singer,
    )
    await tx.wait(1)
}

async function borrowDai(
    lendingPool,
    singer,
    amountDaiToBorrowWei,
    daiAddress,
) {
    /**
     * assert DAI 的合约地址   || 
       amount 借取金额  
       interestRateMode 贷款模式  1 for Stable, 2 for Variable  
       referralCode  用户自己操作 选0
       onBehalfOf 接收贷款款项的人
     */
    const tx = await lendingPool.borrow(
        daiAddress,
        amountDaiToBorrowWei,
        1,
        0,
        singer,
    )
    await tx.wait(1)
    console.log("You have borrowed.")
}

async function getDaiPrice() {
    /***
     * chainlink的主网的price feed地址 0x773616E4d11A78F511299002da57A0a94577F1f4
     * 参考地址：https://docs.chain.link/data-feeds/price-feeds/addresses
     *  */
    const chainLinkPriceFeedContract =
        "0x773616E4d11A78F511299002da57A0a94577F1f4"

    //getContractAt 第三个参数不传的时候，是不需要账户签名绑定，如果是只读操作，则可不传第三个参数
    const aggregatorV3 = await ethers.getContractAt(
        "AggregatorV3Interface",
        chainLinkPriceFeedContract,
    )
    const daiPrice = (await aggregatorV3.latestRoundData())[1]
    console.log(`Current DAI/ETH price is ${daiPrice}`)
    return daiPrice
}

//获取用户在贷款池中的数据信息
async function getUserAccountData(lendingPool, singer) {
    const {
        totalCollateralETH,
        totalDebtETH,
        availableBorrowsETH,
        currentLiquidationThreshold,
        ltv,
        healthFactor,
    } = await lendingPool.getUserAccountData(singer)

    console.log(
        `You have total collateral ETH: ${totalCollateralETH} ,
        total debt ETH:${totalDebtETH},
        available borrows ETH:${availableBorrowsETH}, 
        current liquidation threshold:${currentLiquidationThreshold},
        ltv:${ltv},
        health factor:${healthFactor}`,
    )
    return {
        totalCollateralETH,
        totalDebtETH,
        availableBorrowsETH,
        currentLiquidationThreshold,
        ltv,
        healthFactor,
    }
}

//可以把这个方法理解为向ercAddress地址进行充值
async function approveWethDeposit(ercAddress, singer, amount, spenderAddress) {
    //获取weth合约对象
    const irec20 = await ethers.getContractAt("IERC20", ercAddress, singer)
    /**
     *
     * 1.批准转入spender的weth数量，执行approve方法，一定要保证提前兑换了weth
     * 2.amount金额<= 存入金额
     * */
    const tx = await irec20.approve(spenderAddress, amount)
    await tx.wait(1)
    console.log("Approved")
}

/**
 *
 * @param {*} singer 合约名签对象
 * @returns 借款池，也可以理解成为抵押池。我们会讲将weth抵押给这个对象，并获取对应的稳定币
 */
async function getLendingPool(singer) {
    // aave 提供了借款池提供者的实现合约 可参考：https://docs.aave.com/developers/v/2.0/deployed-contracts/deployed-contracts
    // 借款池提供者的实现合约地址:0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        "0xb53c1a33016b2dc2ff3653530bff1848a515c8c5",
        singer,
    )
    //获取到借款池的合约地址
    const lendingPoolAddress =
        await lendingPoolAddressesProvider.getLendingPool()
    console.log(`LendingPool address is ${lendingPoolAddress}`)
    //通过合约地址获取合约对象
    const lendingPool = await ethers.getContractAt(
        "ILendingPool",
        lendingPoolAddress,
        singer,
    )
    return lendingPool
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
