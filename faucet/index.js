const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');
const solveCaptcha = require('./solve_cap.js');
const colors = require('colors/safe');
const { DateTime } = require('luxon');

class MonadApiClient {
    constructor() {
        this.API_URL = 'https://testnet.monad.xyz/api/claim';
        this.baseHeaders = {
            "accept": "*/*",
            "accept-language": "fr-CH,fr;q=0.9,en-US;q=0.8,en;q=0.7",
            "content-type": "application/json",
            "origin": "https://testnet.monad.xyz",
            "priority": "u=1, i",
            "referer": "https://testnet.monad.xyz/",
            "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="131", "Google Chrome";v="131"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        };
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(colors.green(`[${timestamp}] [✓] ${msg}`));
                break;
            case 'custom':
                console.log(colors.magenta(`[${timestamp}] [*] ${msg}`));
                break;        
            case 'error':
                console.log(colors.red(`[${timestamp}] [✗] ${msg}`));
                break;
            case 'warning':
                console.log(colors.yellow(`[${timestamp}] [!] ${msg}`));
                break;
            default:
                console.log(colors.blue(`[${timestamp}] [ℹ] ${msg}`));
        }
    }

    async generateSessionCookie(proxy) {
        const proxyAgent = new HttpsProxyAgent(proxy);
        try {
            const response = await axios.get('https://testnet.monad.xyz/', {
                headers: this.baseHeaders,
                httpsAgent: proxyAgent,
                maxRedirects: 5,
                validateStatus: null
            });
            
            const cookies = response.headers['set-cookie'];
            if (cookies) {
                return cookies.map(cookie => cookie.split(';')[0]).join('; ');
            }
            return '';
        } catch (error) {
            this.log(`Error generating session cookie: ${error.message}`, 'error');
            return '';
        }
    }

    async buildHeaders(proxy) {
        const sessionCookie = await this.generateSessionCookie(proxy);
        return {
            ...this.baseHeaders,
            'cookie': sessionCookie,
            'origin': 'https://testnet.monad.xyz',
            'referer': 'https://testnet.monad.xyz/',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
        };
    }

    async simulatePageInteraction(proxyAgent) {
        const pages = [
            '/',
            '/favicon.ico'
        ];

        for (const page of pages) {
            try {
                await axios.get(`https://testnet.monad.xyz${page}`, {
                    headers: this.baseHeaders,
                    httpsAgent: proxyAgent,
                    timeout: 10000
                });
                await new Promise(resolve => setTimeout(resolve, this.generateRandomDelay(1000, 3000)));
            } catch (error) {
                this.log(`Failed to fetch ${page}: ${error.message}`, 'warning');
            }
        }
    }

    generateRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            this.log('Checking proxy IP...', 'info');
            
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent,
                timeout: 10000
            });
            
            return response.data.ip;
        } catch (error) {
            throw new Error(`Error checking proxy IP: ${error.message}`);
        }
    }

    async makeRequest(walletAddress, proxy, retryAttempt = 0) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const proxyIP = await this.checkProxyIP(proxy);
            this.log(`Đang sử dụng proxy IP: ${proxyIP}`, 'custom');
    
            const headers = await this.buildHeaders(proxy);
            
            await this.simulatePageInteraction(proxyAgent);
            
            await new Promise(resolve => setTimeout(resolve, this.generateRandomDelay(3000, 6000)));
    
            this.log('Bắt đầu giải captcha...', 'info');
            const captchaResult = await solveCaptcha();
            
            if (captchaResult.error) {
                throw new Error(`Giải captcha thất bại: ${captchaResult.error}`);
            }
    
            await new Promise(resolve => setTimeout(resolve, this.generateRandomDelay(4000, 8000)));
            const visitorId = crypto.randomBytes(16).toString('hex');
            const timestamp = Date.now();
            const payload = {
                address: walletAddress,
                visitorId: visitorId,
                recaptchaToken: captchaResult.data
            };
    
            this.log('Claim Mon...', 'info');
            const response = await axios.post(this.API_URL, payload, {
                headers: {
                    ...headers,
                    'x-request-id': crypto.randomUUID(),
                    'x-client-timestamp': timestamp.toString()
                },
                httpsAgent: proxyAgent,
                timeout: 30000
            });
    
            return {
                success: true,
                data: response.data,
                proxyIP
            };
    
        } catch (error) {
            const shouldRetry = (
                error.response?.data?.message === "Server error on QuickNode API" ||
                error.response?.status === 504 ||
                error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                (error.response?.status >= 500 && error.response?.status < 600) ||
                error.message.includes('timeout') ||
                (error.response?.data && typeof error.response.data === 'string' && 
                 error.response.data.includes('FUNCTION_INVOCATION_TIMEOUT'))
            );
            
            const MAX_RETRY_ATTEMPTS = 3;
            
            if (shouldRetry && retryAttempt < MAX_RETRY_ATTEMPTS) {
                const delayTime = 8000 * (retryAttempt + 1);
                this.log(`Gặp lỗi: ${error.message}, chờ ${delayTime/1000} giây và thử lại... (${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS})`, 'warning');
                await new Promise(resolve => setTimeout(resolve, delayTime));
                return this.makeRequest(walletAddress, proxy, retryAttempt + 1);
            }
            
            return {
                success: false,
                error: error.message,
                details: error.response?.data || null,
                retryAttempted: retryAttempt > 0
            };
        }
    }
}

async function loadAndCleanFile(filename) {
    try {
        const content = await fs.readFile(filename, 'utf-8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line)
            .map(line => line.replace(/\r/g, ''));
    } catch (error) {
        console.error(colors.red(`[${new Date().toLocaleTimeString()}] [✗] không thể đọc ${filename}: ${error.message}`));
        return [];
    }
}

async function loadSuccessfulClaims() {
    try {
        const content = await fs.readFile('successful_claims.txt', 'utf-8');
        const claims = content.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [timestamp, address, ip] = line.split(',');
                return { timestamp, address, ip };
            });
        return claims;
    } catch (error) {
        console.error(colors.red(`[${new Date().toLocaleTimeString()}] [✗] không thể đọc successful_claims.txt: ${error.message}`));
        return [];
    }
}

async function getLastClaimTime(walletAddress, successfulClaims) {
    const walletClaims = successfulClaims.filter(claim => claim.address.toLowerCase() === walletAddress.toLowerCase());
    
    if (walletClaims.length === 0) {
        return null;
    }
    
    walletClaims.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    return DateTime.fromISO(walletClaims[0].timestamp);
}

async function cleanupSuccessfulClaimsFile(client) {
    try {
        client.log('Bắt đầu dọn dẹp file successful_claims.txt...', 'info');
        
        const allClaims = await loadSuccessfulClaims();
        if (allClaims.length === 0) {
            client.log('Không có dữ liệu claims để dọn dẹp', 'warning');
            return;
        }
        
        const claimsByWallet = {};
        allClaims.forEach(claim => {
            const address = claim.address.toLowerCase();
            if (!claimsByWallet[address]) {
                claimsByWallet[address] = [];
            }
            claimsByWallet[address].push(claim);
        });
        
        let totalCleanedEntries = 0;
        const cleanedClaims = [];
        
        for (const [address, claims] of Object.entries(claimsByWallet)) {
            claims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            if (claims.length > 2) {
                const removedCount = claims.length - 2;
                totalCleanedEntries += removedCount;
                client.log(`Địa chỉ ${address}: Giữ lại 2/${claims.length} bản ghi mới nhất, xóa ${removedCount} bản ghi cũ`, 'custom');
                cleanedClaims.push(...claims.slice(0, 2));
            } else {
                cleanedClaims.push(...claims);
            }
        }
        
        if (totalCleanedEntries > 0) {
            cleanedClaims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            const cleanedContent = cleanedClaims.map(claim => 
                `${claim.timestamp},${claim.address},${claim.ip}`
            ).join('\n') + '\n';
            
            await fs.writeFile('successful_claims.txt', cleanedContent);
            client.log(`Dọn dẹp hoàn tất: Đã xóa ${totalCleanedEntries} bản ghi cũ, còn lại ${cleanedClaims.length} bản ghi`, 'success');
            
        } else {
            client.log('Không cần dọn dẹp file, tất cả các địa chỉ ví đều có ít hơn hoặc bằng 2 bản ghi', 'info');
        }
    } catch (error) {
        client.log(`Lỗi khi dọn dẹp file successful_claims.txt: ${error.message}`, 'error');
    }
}

async function processWithProxies() {
    const client = new MonadApiClient();
    
    try {
        const walletAddresses = await loadAndCleanFile('wallet.txt');
        const proxies = await loadAndCleanFile('proxy.txt');
        const successfulClaims = await loadSuccessfulClaims();

        if (walletAddresses.length === 0) {
            throw new Error('Không tìm thấy ví trong wallet.txt');
        }
        
        if (proxies.length === 0) {
            throw new Error('Không tìm thấy proxy trong proxy.txt');
        }
        
        if (walletAddresses.length !== proxies.length) {
            throw new Error(`Số địa chỉ ví (${walletAddresses.length}) không khớp với số proxy (${proxies.length})`);
        }

        client.log(`Tìm thấy ${walletAddresses.length} ví và ${proxies.length} proxy`, 'success');
        client.log(`Tải dữ liệu từ successful_claims.txt: ${successfulClaims.length} claim thành công`, 'info');
        
        await cleanupSuccessfulClaimsFile(client);
        
        const updatedSuccessfulClaims = await loadSuccessfulClaims();
        
        for (let i = 0; i < walletAddresses.length; i++) {
            const walletAddress = walletAddresses[i];
            const proxy = proxies[i];
            
            client.log(`Đang kiểm tra ${i + 1}/${walletAddresses.length}`, 'custom');
            client.log(`Wallet: ${walletAddress}`, 'info');
            
            const lastClaimTime = await getLastClaimTime(walletAddress, updatedSuccessfulClaims);
            const now = DateTime.now();
            
            if (lastClaimTime) {
                const hoursSinceLastClaim = now.diff(lastClaimTime, 'hours').hours;
                client.log(`Claim cuối vào: ${lastClaimTime.toLocal().toFormat('yyyy-MM-dd HH:mm:ss')}`, 'info');
                client.log(`Thời gian đã trôi qua: ${hoursSinceLastClaim.toFixed(2)} giờ`, 'info');
                
                if (hoursSinceLastClaim < 12) {
                    client.log(`Bỏ qua ví này - chưa đủ 12 giờ từ lần claim trước (còn ${(12 - hoursSinceLastClaim).toFixed(2)} giờ nữa)`, 'warning');
                    continue;
                }
            }
            
            if (i > 0) {
                const delay = Math.floor(Math.random() * 9000) + 1000;
                client.log(`Chờ ${delay}ms trước khi tiếp tục...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            const result = await client.makeRequest(walletAddress, proxy);
            
            if (result.success) {
                client.log(`Faucet mon thành công: ${JSON.stringify(result.data)}`, 'success');
                await fs.appendFile('successful_claims.txt', 
                    `${DateTime.now().toISO()},${walletAddress},${result.proxyIP}\n`
                );
            } else {
                if (result.retryAttempted) {
                    client.log(`Faucet mon không thành công sau khi thử lại: ${result.error}`, 'error');
                } else {
                    client.log(`Faucet mon không thành công: ${result.error}`, 'error');
                }
                
                if (result.details) {
                    client.log(`Lỗi: ${JSON.stringify(result.details)}`, 'error');
                }
                await fs.appendFile('failed_claims.txt', 
                    `${DateTime.now().toISO()},${walletAddress},${result.error}\n`
                );
            }
        }
    } catch (error) {
        client.log(`Lỗi trong quá trình xử lý: ${error.message}`, 'error');
    }
}

processWithProxies().catch(error => {
    console.error(colors.red(`[${new Date().toLocaleTimeString()}] [✗] Unhandled exception: ${error.message}`));
});