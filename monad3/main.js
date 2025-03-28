const ethers = require("ethers");
const prompts = require("prompts");

const availableScripts = [
  { title: "1. Rubics (Swap)", value: "rubic" },
  { title: "2. Izumi (Swap)", value: "izumi" },
  { title: "3. Beanswap (Swap)", value: "beanswap" },
  { title: "4. Magma (Stake)", value: "magma" },
  { title: "5. Apriori (Stake)", value: "apriori" },
  { title: "6. Monorail (Swap)", value: "monorail" },
  { title: "7. Ambient (Swap) (noauto)", value: "ambient" },
  { title: "8. Deploy Contract (noauto)", value: "deployct" },
  { title: "9. Kintsu (Stake)", value: "kintsu" },
  { title: "10. Shmonad (Stake)", value: "shmonad" },
  { title: "11. Octoswap (Swap)", value: "octoswap" },
  { title: "Chạy auto lần lượt 1-6", value: "all" },
  { title: "Chạy auto lần lượt 1-6, 9, 10 và 11", value: "all-with-kintsu-shmonad" },
  { title: "Exit", value: "exit" },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scriptConfigs = {
  rubic: { cycles: 1, intervalHours: null },
  magma: { cycles: 1, intervalHours: null },
  izumi: { cycles: 1, intervalHours: null },
  apriori: { cycles: 1, intervalHours: null },
  beanswap: { cycles: 1, intervalHours: null },
  monorail: { cycles: 1, intervalHours: null },
  ambient: { cycles: 1, intervalHours: null },
  kintsu: { cycles: 1, intervalHours: null, tokenId: 1 },
  shmonad: { cycles: 1, intervalHours: null },
  octoswap: { cycles: 1, intervalHours: null }
};

async function runScript(scriptName, automated = false) {
  try {
    let scriptModule;
    
    switch (scriptName) {
      case "rubic":
        console.log("Chạy Rubics (Swap)...");
        scriptModule = require("./scripts/rubic");
        break;

      case "magma":
        console.log("Chạy Magma (Stake)...");
        scriptModule = require("./scripts/magma");
        break;

      case "izumi":
        console.log("Chạy Izumi (Swap)...");
        scriptModule = require("./scripts/izumi");
        break;

      case "apriori":
        console.log("Chạy Apriori (Stake)...");
        scriptModule = require("./scripts/apriori");
        break;
        
      case "beanswap":
        console.log("Chạy Beanswap (Swap)...");
        scriptModule = require("./scripts/beanswap");
        break;
        
      case "monorail":
        console.log("Chạy Monorail (Swap)...");
        scriptModule = require("./scripts/monorail");
        break;
        
      case "ambient":
        console.log("Chạy Ambient (Swap)...");
        scriptModule = require("./scripts/ambient");
        break;
        
      case "deployct":
        console.log("Chạy Deploy Contract...");
        scriptModule = require("./scripts/deployct");
        break;
        
      case "kintsu":
        console.log("Chạy Kintsu (Stake)...");
        scriptModule = require("./scripts/kintsu");
        break;
        
      case "shmonad":
        console.log("Chạy Shmonad (Stake)...");
        scriptModule = require("./scripts/shmonad");
        break;
        
      case "octoswap":
        console.log("Chạy Octoswap (Swap)...");
        scriptModule = require("./scripts/octoswap");
        break;

      default:
        console.log(`Unknown script: ${scriptName}`);
        return;
    }
    
    if (scriptName === "ambient" || scriptName === "deployct") {
      automated = false;
    }
    
    if (automated && scriptModule.runAutomated) {
      if (scriptName === "kintsu") {
        await scriptModule.runAutomated(
          scriptConfigs[scriptName].cycles, 
          scriptConfigs[scriptName].tokenId,
          scriptConfigs[scriptName].intervalHours
        );
      } else {
        await scriptModule.runAutomated(
          scriptConfigs[scriptName].cycles, 
          scriptConfigs[scriptName].intervalHours
        );
      }
    } else if (automated) {
      console.log(`Warning: ${scriptName} tập lệnh không hỗ trợ chế độ auto.`);
      await scriptModule.run();
    } else {
      await scriptModule.run();
    }
  } catch (error) {
    console.error(`Không thể chạy ${scriptName} script:`, error.message);
  }
}

async function runAllScriptsSequentially(includeKintsu = false, includeShmonad = false) {
  let scriptOrder = ["rubic", "izumi", "beanswap", "magma", "apriori", "monorail"];
  
  if (includeKintsu) {
    scriptOrder.push("kintsu");
  }
  
  if (includeShmonad) {
    scriptOrder.push("shmonad");
    scriptOrder.push("octoswap");
  }
  
  console.log("-".repeat(60));
  let automationMessage = "Đang ở chế độ tự động chạy lần lượt ";
  
  if (includeKintsu && includeShmonad) {
    automationMessage += "từ 1-6, 9, 10 và 11";
  } else {
    automationMessage += "từ 1-6";
  }
  
  console.log(automationMessage);
  console.log("-".repeat(60));
  
  const response = await prompts([
    {
      type: 'number',
      name: 'cycles',
      message: 'Bạn muốn chạy bao nhiêu chu kỳ cho mỗi tập lệnh?',
      initial: 1
    },
    {
      type: 'number',
      name: 'intervalHours',
      message: 'Khoảng thời gian chạy tính bằng giờ (0 nếu không lặp lại):',
      initial: 0
    }
  ]);
  
  if (includeKintsu) {
    const tokenIdResponse = await prompts({
      type: 'number',
      name: 'tokenId',
      message: 'Nhập token ID cho kintsu (mặc định: 1):',
      initial: 1
    });
    
    scriptConfigs.kintsu.tokenId = tokenIdResponse.tokenId || 1;
  }
  
  for (const script of scriptOrder) {
    scriptConfigs[script].cycles = response.cycles || 1;
    scriptConfigs[script].intervalHours = response.intervalHours > 0 ? response.intervalHours : null;
  }
  
  for (let i = 0; i < scriptOrder.length; i++) {
    const scriptName = scriptOrder[i];
    console.log(`\n[${i + 1}/${scriptOrder.length}] Bắt đầu chạy ${scriptName.toUpperCase()}...`);
    
    await runScript(scriptName, true);
    
    if (i < scriptOrder.length - 1) {
      console.log(`\nĐã chạy xong ${scriptName.toUpperCase()}. Chờ 5 giây trước khi tiếp tục...`);
      await delay(5000);
    } else {
      console.log(`\nĐã chạy xong ${scriptName.toUpperCase()}.`);
    }
  }
  
  console.log("-".repeat(60));
  console.log("Đã chạy xong tất cả, follow Dân Cày Airdrop nhé anh em!");
  console.log("-".repeat(60));
}

async function run() {
  const response = await prompts({
    type: "select",
    name: "script",
    message: "Chọn bất kì để bắt đầu chạy:",
    choices: availableScripts,
  });

  const selectedScript = response.script;

  if (!selectedScript) {
    console.log("Không có tập lệnh nào được chọn. Dừng bot...");
    return;
  }

  if (selectedScript === "all") {
    await runAllScriptsSequentially(false, false);
  } else if (selectedScript === "all-with-kintsu-shmonad") {
    await runAllScriptsSequentially(true, true);
  } else if (selectedScript === "exit") {
    console.log("Dừng bot...");
    process.exit(0);
  } else {
    await runScript(selectedScript);
  }
}

run().catch((error) => {
  console.error("Error occurred:", error);
});

module.exports = { runScript, runAllScriptsSequentially };