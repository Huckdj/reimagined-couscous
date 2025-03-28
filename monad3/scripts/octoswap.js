const { ethers } = require("ethers");
const colors = require("colors");
const prompts = require("prompts");
const fs = require("fs");
const config = require('./config');

const RPC_URL = "https://testnet-rpc.monad.xyz/";
const TX_EXPLORER = "https://testnet.monadexplorer.com/tx/";
const WALLET_FILE = "wallet.txt";
const ACCOUNT_SWITCH_DELAY = 3000;

const ROUTER_CONTRACT = "0xb6091233aAcACbA45225a2B2121BBaC807aF4255";
const WMON_CONTRACT = "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";
const USDC_CONTRACT = "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea";
const USDT_CONTRACT = "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D";
const TEST1_CONTRACT = "0xe42cFeCD310d9be03d3F80D605251d8D0Bc5cDF3";
const TEST2_CONTRACT = "0x73c03bc8F8f094c61c668AE9833D7Ed6C04FDc21";
const DAK_CONTRACT = "0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714";

const availableTokens = {
  MON:   { name: "MON",   address: null,           decimals: 18, native: true  },
  WMON:  { name: "WMON",  address: WMON_CONTRACT,  decimals: 18, native: false },
  USDC:  { name: "USDC",  address: USDC_CONTRACT,  decimals: 6,  native: false },
  DAK:   { name: "DAK",   address: DAK_CONTRACT,   decimals: 18, native: false },
  USDT:  { name: "USDT",  address: USDT_CONTRACT,  decimals: 6,  native: false },
  TEST1: { name: "TEST1", address: TEST1_CONTRACT, decimals: 18, native: false },
  TEST2: { name: "TEST2", address: TEST2_CONTRACT, decimals: 18, native: false }
};

const ABI = {
  router: [
    {
      "type": "function",
      "name": "getAmountsOut",
      "inputs": [
        { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
        { "internalType": "address[]", "name": "path", "type": "address[]" }
      ],
      "outputs": [
        { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "swapExactETHForTokens",
      "inputs": [
        { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
        { "internalType": "address[]", "name": "path", "type": "address[]" },
        { "internalType": "address", "name": "to", "type": "address" },
        { "internalType": "uint256", "name": "deadline", "type": "uint256" }
      ],
      "outputs": [
        { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
      ],
      "stateMutability": "payable"
    },
    {
      "type": "function",
      "name": "swapExactTokensForETH",
      "inputs": [
        { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
        { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
        { "internalType": "address[]", "name": "path", "type": "address[]" },
        { "internalType": "address", "name": "to", "type": "address" },
        { "internalType": "uint256", "name": "deadline", "type": "uint256" }
      ],
      "outputs": [
        { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "swapExactTokensForTokens",
      "inputs": [
        { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
        { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
        { "internalType": "address[]", "name": "path", "type": "address[]" },
        { "internalType": "address", "name": "to", "type": "address" },
        { "internalType": "uint256", "name": "deadline", "type": "uint256" }
      ],
      "outputs": [
        { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
      ],
      "stateMutability": "nonpayable"
    }
  ],
  token: [
    {
      "type": "function",
      "name": "approve",
      "inputs": [
        { "name": "guy", "type": "address" },
        { "name": "wad", "type": "uint256" }
      ],
      "outputs": [
        { "name": "", "type": "bool" }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "balanceOf",
      "inputs": [
        { "name": "", "type": "address" }
      ],
      "outputs": [
        { "name": "", "type": "uint256" }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "deposit",
      "inputs": [],
      "outputs": [],
      "stateMutability": "payable"
    },
    {
      "type": "function",
      "name": "withdraw",
      "inputs": [
        { "name": "wad", "type": "uint256" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "allowance",
      "inputs": [
        { "name": "", "type": "address" },
        { "name": "", "type": "address" }
      ],
      "outputs": [
        { "name": "", "type": "uint256" }
      ],
      "stateMutability": "view"
    }
  ]
};

const ROUTER_ABI = ABI.router;
const ERC20_ABI = ABI.token;
const WMON_ABI = ABI.token.filter(method => 
  ["deposit", "withdraw", "balanceOf", "approve", "allowance"].includes(method.name)
);

function readPrivateKeys() {
  try {
    const data = fs.readFileSync(WALLET_FILE, 'utf8');
    return data.split('\n').map(key => key.trim()).filter(key => key !== '');
  } catch (error) {
    console.error(`❌ Không đọc được file wallet.txt: ${error.message}`.red);
    process.exit(1);
  }
}

async function getRandomAmount(wallet, token, minThreshold = "0.0001") {
  try {
    let balance = token.native 
      ? await wallet.getBalance()
      : await new ethers.Contract(token.address, ERC20_ABI, wallet).balanceOf(wallet.address);
    
    const minPercentage = config.transactionLimits.minPercentage || 10;
    const maxPercentage = config.transactionLimits.maxPercentage || 50;
    
    const min = balance.mul(minPercentage * 10).div(1000);
    const max = balance.mul(maxPercentage * 10).div(1000);
    
    const minAmount = ethers.utils.parseUnits(minThreshold, token.decimals);
    if (min.lt(minAmount)) {
      console.log(`⚠️ Số dư ${token.name} quá thấp, cần bổ sung`.yellow);
      return null; // Indicates insufficient balance
    }
    
    const range = max.sub(min);
    const randomValue = ethers.BigNumber.from(ethers.utils.randomBytes(32)).mod(range);
    return min.add(randomValue);
  } catch (error) {
    console.error(`❌ Lỗi tính lượng ngẫu nhiên cho ${token.name}: ${error.message}`.red);
    return null;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getTokenBalance(wallet, token) {
  try {
    const balance = token.native 
      ? await wallet.provider.getBalance(wallet.address)
      : await new ethers.Contract(token.address, ERC20_ABI, wallet).balanceOf(wallet.address);
    return {
      raw: balance,
      formatted: ethers.utils.formatUnits(balance, token.decimals)
    };
  } catch (error) {
    console.error(`❌ Lỗi lấy số dư ${token.name}: ${error.message}`.red);
    return { raw: ethers.BigNumber.from(0), formatted: "0" };
  }
}

async function approveTokenIfNeeded(wallet, token, amount, routerAddress) {
  if (token.native) return true;
  
  try {
    const tokenContract = new ethers.Contract(token.address, ERC20_ABI, wallet);
    const allowance = await tokenContract.allowance(wallet.address, routerAddress);
    
    if (allowance.lt(amount)) {
      console.log(`⚙️ Đang approve ${token.name}...`.cyan);
      const tx = await tokenContract.approve(routerAddress, ethers.constants.MaxUint256);
      console.log(`🚀 Approve Tx: ${TX_EXPLORER}${tx.hash}`.yellow);
      await tx.wait();
      console.log(`✅ Đã approve ${token.name}`.green);
    }
    return true;
  } catch (error) {
    console.error(`❌ Lỗi approve ${token.name}: ${error.message}`.red);
    return false;
  }
}

async function performSwap(wallet, tokenA, tokenB, amountIn) {
  try {
    if (tokenA.native && tokenB.name === "WMON") {
      console.log(`🔄 Wrap ${ethers.utils.formatEther(amountIn)} MON → WMON...`.magenta);
      const wmonContract = new ethers.Contract(WMON_CONTRACT, WMON_ABI, wallet);
      const tx = await wmonContract.deposit({ value: amountIn, gasLimit: 500000 });
      console.log(`🚀 Wrap Tx: ${TX_EXPLORER}${tx.hash}`.yellow);
      await tx.wait();
      console.log(`✅ Wrap MON → WMON thành công`.green);
      return true;
    }
    
    if (tokenA.name === "WMON" && tokenB.native) {
      console.log(`🔄 Unwrap ${ethers.utils.formatEther(amountIn)} WMON → MON...`.magenta);
      const wmonContract = new ethers.Contract(WMON_CONTRACT, WMON_ABI, wallet);
      const tx = await wmonContract.withdraw(amountIn, { gasLimit: 500000 });
      console.log(`🚀 Unwrap Tx: ${TX_EXPLORER}${tx.hash}`.yellow);
      await tx.wait();
      console.log(`✅ Unwrap WMON → MON thành công`.green);
      return true;
    }
    
    if (!tokenA.native) {
      const approveSuccess = await approveTokenIfNeeded(wallet, tokenA, amountIn, ROUTER_CONTRACT);
      if (!approveSuccess) return false;
    }
    
    const routerContract = new ethers.Contract(ROUTER_CONTRACT, ROUTER_ABI, wallet);
    const deadline = Math.floor(Date.now() / 1000) + 6 * 3600;
    const path = [tokenA.native ? WMON_CONTRACT : tokenA.address, tokenB.native ? WMON_CONTRACT : tokenB.address];
    
    const amountsOut = await routerContract.getAmountsOut(amountIn, path);
    const expectedOut = amountsOut[amountsOut.length - 1];
    const minAmountOut = expectedOut.mul(95).div(100);
    
    const formattedAmountIn = ethers.utils.formatUnits(amountIn, tokenA.decimals);
    const formattedAmountOut = ethers.utils.formatUnits(expectedOut, tokenB.decimals);
    console.log(`🔄 Swap ${formattedAmountIn} ${tokenA.name} → ${formattedAmountOut} ${tokenB.name}`.magenta);
    
    const feeData = await wallet.provider.getFeeData();
    const randomGasLimit = Math.floor(Math.random() * (350000 - 250000 + 1)) + 250000;
    const txOverrides = {
      gasLimit: randomGasLimit,
      maxFeePerGas: feeData.maxFeePerGas || feeData.gasPrice,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || feeData.gasPrice
    };
    
    let tx;
    if (tokenA.native) {
      tx = await routerContract.swapExactETHForTokens(minAmountOut, path, wallet.address, deadline, { value: amountIn, ...txOverrides });
    } else if (tokenB.native) {
      tx = await routerContract.swapExactTokensForETH(amountIn, minAmountOut, path, wallet.address, deadline, txOverrides);
    } else {
      tx = await routerContract.swapExactTokensForTokens(amountIn, minAmountOut, path, wallet.address, deadline, txOverrides);
    }
    
    console.log(`🚀 Swap Tx: ${TX_EXPLORER}${tx.hash}`.yellow);
    const receipt = await tx.wait();
    console.log(`✅ Swap ${tokenA.name} → ${tokenB.name} thành công (Block ${receipt.blockNumber})`.green);
    return true;
  } catch (error) {
    console.error(`❌ Lỗi swap ${tokenA.name} → ${tokenB.name}: ${error.message}`.red);
    return false;
  }
}

async function getTokenValueInMON(wallet, token) {
  if (token.native) {
    const balance = await getTokenBalance(wallet, token);
    return ethers.utils.parseEther(balance.formatted);
  }
  
  if (token.name === "WMON") {
    const balance = await getTokenBalance(wallet, token);
    return ethers.utils.parseUnits(balance.formatted, 18); // 1:1 with MON
  }
  
  const routerContract = new ethers.Contract(ROUTER_CONTRACT, ROUTER_ABI, wallet);
  const balance = await getTokenBalance(wallet, token);
  if (balance.raw.eq(0)) return ethers.BigNumber.from(0);
  
  const path = [token.address, WMON_CONTRACT];
  try {
    const amountsOut = await routerContract.getAmountsOut(balance.raw, path);
    return amountsOut[1]; // Amount in MON (via WMON)
  } catch (error) {
    console.error(`❌ Lỗi tính giá trị ${token.name} sang MON: ${error.message}`.red);
    return ethers.BigNumber.from(0);
  }
}

async function runSwapCycle(wallet) {
  try {
    const tokenKeys = Object.keys(availableTokens);
    let tokenAKey, tokenBKey;
    do {
      tokenAKey = tokenKeys[Math.floor(Math.random() * tokenKeys.length)];
      tokenBKey = tokenKeys[Math.floor(Math.random() * tokenKeys.length)];
    } while (tokenAKey === tokenBKey);
    
    let tokenA = availableTokens[tokenAKey];
    const tokenB = availableTokens[tokenBKey];
    
    console.log(`🔄 Đã chọn cặp swap: ${tokenA.name} → ${tokenB.name}`.cyan);
    
    let amountIn = await getRandomAmount(wallet, tokenA);
    if (!amountIn) {
      console.log(`⚠️ Số dư ${tokenA.name} quá thấp, dùng MON để swap sang ${tokenA.name}`.yellow);
      const monToken = availableTokens["MON"];
      const monBalance = await getTokenBalance(wallet, monToken);
      if (monBalance.raw.lt(ethers.utils.parseEther("0.01"))) {
        console.log(`❌ Số dư MON quá thấp: ${monBalance.formatted} MON`.red);
        return false;
      }
      amountIn = ethers.utils.parseEther("0.01"); // Use 0.01 MON to get tokenA
      const success = await performSwap(wallet, monToken, tokenA, amountIn);
      if (!success) return false;
      amountIn = await getRandomAmount(wallet, tokenA);
      if (!amountIn) {
        console.log(`❌ Vẫn không đủ ${tokenA.name} sau khi swap từ MON`.red);
        return false;
      }
    }
    
    const swapSuccess = await performSwap(wallet, tokenA, tokenB, amountIn);
    if (!swapSuccess) return false;
    
    // Check all tokens and swap to MON if value > 1 MON
    const monThreshold = ethers.utils.parseEther("1");
    for (const key of tokenKeys) {
      const token = availableTokens[key];
      if (token.native) continue; // Skip MON itself
      const valueInMON = await getTokenValueInMON(wallet, token);
      if (valueInMON.gt(monThreshold)) {
        const balance = await getTokenBalance(wallet, token);
        console.log(`💰 ${token.name} có giá trị ${ethers.utils.formatEther(valueInMON)} MON (> 1 MON), swap về MON`.cyan);
        const amountToSwap = balance.raw;
        await performSwap(wallet, token, availableTokens["MON"], amountToSwap);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Lỗi trong chu kỳ swap: ${error.message}`.red);
    return false;
  }
}

async function runSwapCyclesForAccount(privateKey, cycles) {
  try {
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    const address = wallet.address;
    const truncatedAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    console.log(`\n👤 Đang xử lý tài khoản: ${truncatedAddress}`.cyan);

    let completedCycles = 0;
    for (let i = 0; i < cycles; i++) {
      console.log(`Chu kỳ ${i + 1}/${cycles}:`.magenta);
      const success = await runSwapCycle(wallet);
      if (success) completedCycles++;
      if (i < cycles - 1) {
        console.log(`⏱️ Đợi 3 giây trước chu kỳ tiếp theo...`.cyan);
        await delay(ACCOUNT_SWITCH_DELAY);
      }
    }

    console.log(`✅ Hoàn thành ${completedCycles}/${cycles} chu kỳ cho tài khoản ${truncatedAddress}`.green);
    return true;
  } catch (error) {
    console.error(`❌ Lỗi xử lý tài khoản ${privateKey.substring(0, 6)}...: ${error.message}`.red);
    return false;
  }
}

async function processAllAccounts(cycles, interval) {
  try {
    const privateKeys = readPrivateKeys();
    console.log(`📋 Tìm thấy ${privateKeys.length} tài khoản trong wallet.txt`.cyan);

    for (let i = 0; i < privateKeys.length; i++) {
      console.log(`\n🔄 Đang xử lý tài khoản ${i + 1}/${privateKeys.length}`.cyan);
      const success = await runSwapCyclesForAccount(privateKeys[i], cycles);
      if (!success) console.log(`⚠️ Không thể xử lý tài khoản ${i + 1}`.yellow);
      if (i < privateKeys.length - 1) {
        console.log(`⏱️ Chờ 3 giây trước tài khoản tiếp theo...`.cyan);
        await delay(ACCOUNT_SWITCH_DELAY);
      }
    }

    if (interval) {
      console.log(`⏱️ Đợt tiếp theo sẽ chạy sau ${interval} giờ`.cyan);
      setTimeout(() => processAllAccounts(cycles, interval), interval * 60 * 60 * 1000);
    } else {
      console.log(`✅ Đã xử lý xong tất cả tài khoản`.green);
    }
  } catch (error) {
    console.error(`❌ Lỗi: ${error.message}`.red);
  }
}

async function run() {
  const response = await prompts([
    {
      type: 'number',
      name: 'cycles',
      message: 'Bạn muốn thực hiện bao nhiêu chu kỳ? (Mặc định 1):',
      initial: 1
    },
    {
      type: 'number',
      name: 'hours',
      message: 'Chạy lại sau bao nhiêu giờ? (Enter để chạy 1 lần):',
      initial: 0
    }
  ]);

  let cyclesCount = response.cycles || 1;
  let intervalHours = response.hours > 0 ? response.hours : null;

  if (isNaN(cyclesCount) || (intervalHours !== null && isNaN(intervalHours))) {
    console.log("❌ Vui lòng nhập số hợp lệ".red);
    return;
  }

  await processAllAccounts(cyclesCount, intervalHours);
}

async function runAutomated(cycles = 1, intervalHours = null) {
  await processAllAccounts(cycles, intervalHours);
  return true;
}

module.exports = { run, runAutomated };

if (require.main === module) {
  run();
}