const ethers = require("ethers");
const colors = require("colors");
const readline = require("readline");
const fs = require("fs");
const config = require('./config');
const RPC_URL = "https://testnet-rpc.monad.xyz/";
const EXPLORER_URL = "https://testnet.monadexplorer.com/tx/";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const contractAddress = "0x3a98250F98Dd388C211206983453837C8365BDc1";
const gasLimitDeposit = 500000;
const gasLimitRedeem = 800000;
const gasLimitBond = 600000;

const contractABI = [
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "redeem",
    "inputs": [
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bond",
    "inputs": [
      {
        "name": "policyID",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "bondRecipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
];

function readPrivateKeys() {
  try {
    const data = fs.readFileSync('wallet.txt', 'utf8');
    const privateKeys = data.split('\n')
      .map(key => key.trim())
      .filter(key => key.length > 0);
    
    console.log(`Tìm thấy ${privateKeys.length} ví trong wallet.txt`.green);
    return privateKeys;
  } catch (error) {
    console.error("❌ Không đọc được file wallet.txt:".red, error.message);
    process.exit(1);
  }
}

async function getRandomAmount(wallet) {
  try {
    const balance = await provider.getBalance(wallet.address);
    const minPercentage = config.transactionLimits.minPercentage;
    const maxPercentage = config.transactionLimits.maxPercentage;
    
    const min = balance.mul(minPercentage * 10).div(1000);
    const max = balance.mul(maxPercentage * 10).div(1000);
    
    if (min.lt(ethers.utils.parseEther(config.minimumTransactionAmount))) {
      console.log("Số dư quá thấp, sử dụng số lượng tối thiểu".yellow);
      return ethers.utils.parseEther(config.minimumTransactionAmount);
    }
    
    const range = max.sub(min);
    const randomBigNumber = ethers.BigNumber.from(
      ethers.utils.randomBytes(32)
    ).mod(range);
    
    const randomAmount = min.add(randomBigNumber);
    
    return randomAmount;
  } catch (error) {
    console.error("❌ Error calculating random amount:".red, error.message);
    return ethers.utils.parseEther(config.defaultTransactionAmount);
  }
}

function getRandomDelay() {
  const minDelay = 30 * 1000;
  const maxDelay = 1 * 60 * 1000;
  return Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function depositMON(wallet, cycleNumber) {
  try {
    console.log(`\n[Chu kỳ ${cycleNumber}] bắt đầu deposit MON...`.magenta);
    console.log(`Wallet: ${wallet.address}`.cyan);

    const depositAmount = await getRandomAmount(wallet);
    console.log(
      `Random số lượng deposit: ${ethers.utils.formatEther(depositAmount)} MON (${config.transactionLimits.minPercentage}-${config.transactionLimits.maxPercentage}% balance)`
    );

    const contract = new ethers.Contract(contractAddress, contractABI, wallet);
    
    console.log("🔄 Gửi yêu cầu deposit...");
    const txResponse = await contract.deposit(
      depositAmount,
      wallet.address,
      {
        value: depositAmount,
        gasLimit: ethers.utils.hexlify(gasLimitDeposit)
      }
    );
    
    console.log(
      `➡️ Transaction sent: ${EXPLORER_URL}${txResponse.hash}`.yellow
    );

    console.log("Đang chờ xác nhận giao dịch...");
    const receipt = await txResponse.wait();
    console.log(`✔️ Deposit thành công!`.green.underline);

    return { receipt, depositAmount };
  } catch (error) {
    console.error("❌ Deposit thất bại:".red, error.message);
    throw error;
  }
}

async function getShmonBalance(wallet) {
  try {
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    const balance = await contract.balanceOf(wallet.address);
    return balance;
  } catch (error) {
    console.error("❌ Lỗi khi kiểm tra số dư shMON:".red, error.message);
    throw error;
  }
}

async function redeemShMON(wallet, cycleNumber) {
  try {
    console.log(`\n[Chu kỳ ${cycleNumber}] chuẩn bị redeem shMON...`.magenta);
    console.log(`Wallet: ${wallet.address}`.cyan);
    
    const shmonBalance = await getShmonBalance(wallet);
    console.log(`Số dư shMON hiện tại: ${ethers.utils.formatEther(shmonBalance)} shMON`);
    
    const redeemAmount = shmonBalance.mul(98).div(100);
    console.log(`Số lượng redeem (98%): ${ethers.utils.formatEther(redeemAmount)} shMON`);
    
    if (redeemAmount.lte(0)) {
      console.log("Không có shMON để redeem".yellow);
      return null;
    }
    
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);
    
    console.log("🔄 Gửi yêu cầu redeem...");
    const txResponse = await contract.redeem(
      redeemAmount,
      wallet.address,
      wallet.address,
      {
        gasLimit: ethers.utils.hexlify(gasLimitRedeem)
      }
    );
    
    console.log(
      `➡️ Transaction sent: ${EXPLORER_URL}${txResponse.hash}`.yellow
    );

    console.log("🔄 Đang chờ xác nhận giao dịch...");
    const receipt = await txResponse.wait();
    console.log(`✔️ Redeem thành công!`.green.underline);

    return receipt;
  } catch (error) {
    console.error("❌ Redeem thất bại:".red, error.message);
    throw error;
  }
}


async function bondShMON(wallet, cycleNumber) {
  try {
    console.log(`\n[Chu kỳ ${cycleNumber}] chuẩn bị commit shMON...`.magenta);
    console.log(`Wallet: ${wallet.address}`.cyan);
    
    const shmonBalance = await getShmonBalance(wallet);
    console.log(`Số dư shMON còn lại: ${ethers.utils.formatEther(shmonBalance)} shMON`);
    
    const bondAmount = shmonBalance.mul(50).div(100);
    console.log(`Số lượng commit (50%): ${ethers.utils.formatEther(bondAmount)} shMON`);
    
    if (bondAmount.lte(0)) {
      console.log("Không có shMON để commit".yellow);
      return null;
    }
    
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);
    const policyID = 4; // PolicyID mặc định là 4
    
    console.log("🔄 Gửi yêu cầu commit...");
    const txResponse = await contract.bond(
      policyID,
      wallet.address,
      bondAmount,
      {
        gasLimit: ethers.utils.hexlify(gasLimitBond)
      }
    );
    
    console.log(
      `➡️ Transaction sent: ${EXPLORER_URL}${txResponse.hash}`.yellow
    );

    console.log("🔄 Đang chờ xác nhận giao dịch...");
    const receipt = await txResponse.wait();
    console.log(`✔️ Commit thành công!`.green.underline);

    return receipt;
  } catch (error) {
    console.error("❌ Commit thất bại:".red, error.message);
    throw error;
  }
}

async function runCycle(wallet, cycleNumber) {
  try {
    console.log(`\n=== Bắt đầu chu kỳ ${cycleNumber} / ${wallet.address} ===`);

    await depositMON(wallet, cycleNumber);

    let delayTimeBeforeRedeem = getRandomDelay();
    console.log(
      `🔄 Đang chờ ${delayTimeBeforeRedeem / 1000} giây trước khi yêu cầu redeem...`
    );
    await delay(delayTimeBeforeRedeem);

    await redeemShMON(wallet, cycleNumber);

    const delayTimeBeforeBond = getRandomDelay();
    console.log(
      `🔄 Đang chờ ${delayTimeBeforeBond / 1000} giây trước khi yêu cầu commit...`
    );
    await delay(delayTimeBeforeBond);

    await bondShMON(wallet, cycleNumber);

    console.log(
      `=== Chu kỳ ${cycleNumber} cho ví ${wallet.address} đã hoàn thành! ===`.magenta.bold
    );
  } catch (error) {
    console.error(`❌ Chu kỳ ${cycleNumber} thất bại:`.red, error.message);
    throw error;
  }
}

async function processAccount(privateKey, cycleCount) {
  try {
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
    }
    
    const wallet = new ethers.Wallet(privateKey, provider);
    const shortAddress = `${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}`;
    console.log(`\n=== Đang xử lý tài khoản ${shortAddress} ===`.cyan.bold);

    const initialBalance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.utils.formatEther(initialBalance)} MON`.yellow);

    for (let i = 1; i <= cycleCount; i++) {
      await runCycle(wallet, i);

      if (i < cycleCount) {
        const interCycleDelay = getRandomDelay();
        console.log(
          `\nChờ ${interCycleDelay / 1000} giây trước chu kỳ tiếp theo...`
        );
        await delay(interCycleDelay);
      }
    }

    const finalBalance = await provider.getBalance(wallet.address);
    console.log(`\nSố dư cuối cùng: ${ethers.utils.formatEther(finalBalance)} MON`.yellow);
    
    const difference = finalBalance.sub(initialBalance);
    if (difference.gt(0)) {
      console.log(`Profit: +${ethers.utils.formatEther(difference)} MON`.green);
    } else {
      console.log(`Loss: ${ethers.utils.formatEther(difference)} MON`.red);
    }

    console.log(`=== Đã hoàn tất quá trình xử lý ví ${shortAddress} ===`.cyan.bold);
    return true;
  } catch (error) {
    console.error(`❌ Xử lý tài khoản không thành công:`.red, error.message);
    return false;
  }
}

async function processAllAccounts(cycleCount, intervalHours) {
  try {
    const privateKeys = readPrivateKeys();
    if (privateKeys.length === 0) {
      console.error("Không tìm thấy privatekey trong wallet.txt".red);
      return false;
    }

    console.log(`📋 Tìm thấy ${privateKeys.length} ví trong wallet.txt`.cyan);
    console.log(`Chạy ${cycleCount} chu kỳ cho mỗi tài khoản...`.yellow);

    for (let i = 0; i < privateKeys.length; i++) {
      console.log(`\n🔄 Đang xử lý tài khoản ${i + 1} / ${privateKeys.length}`.cyan);
      const success = await processAccount(privateKeys[i], cycleCount);
      
      if (!success) {
        console.log(`⚠️ Không xử lý được tài khoản ${i + 1}, chuyển sang tài khoản tiếp theo`.yellow);
      }
      
      if (i < privateKeys.length - 1) {
        console.log("\nChuyển sang tài khoản tiếp theo sau 3 giây...".cyan);
        await delay(3000);
      }
    }

    console.log(
      `\n✅ Tất cả ${privateKeys.length} tài khoản đã được xử lý thành công!`.green.bold
    );
    
    if (intervalHours) {
      console.log(`\n⏱️ Tất cả các tài khoản được xử lý. Đợt tiếp theo sẽ chạy sau ${intervalHours} giờ`.cyan);
      setTimeout(() => processAllAccounts(cycleCount, intervalHours), intervalHours * 60 * 60 * 1000);
    }
    
    return true;
  } catch (error) {
    console.error("❌ Thao tác không thành công:".red, error.message);
    return false;
  }
}

function run() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Bạn muốn chạy bao nhiêu chu kỳ cho mỗi tài khoản? ", (answer) => {
    const cycleCount = parseInt(answer);
    
    if (isNaN(cycleCount) || cycleCount <= 0) {
      console.error("Vui lòng nhập số hợp lệ!".red);
      rl.close();
      process.exit(1);
    }
    
    rl.question(
      "Bạn muốn chu kỳ chạy bao lâu một lần (tính bằng giờ)? (Nhấn enter để chạy ngay): ",
      (hours) => {
        let intervalHours = hours ? parseInt(hours) : null;
        
        if (hours && (isNaN(intervalHours) || intervalHours < 0)) {
          console.error("Vui lòng nhập số hợp lệ!".red);
          rl.close();
          process.exit(1);
        }
        processAllAccounts(cycleCount, intervalHours);
        rl.close();
      }
    );
  });
}

async function runAutomated(cycles = 1, intervalHours = null) {
  await processAllAccounts(cycles, intervalHours);
  return true;
}

module.exports = { 
  run, 
  runAutomated,
  depositMON,
  redeemShMON,
  bondShMON,
  getRandomAmount,
  getRandomDelay,
};

if (require.main === module) {
  run();
}