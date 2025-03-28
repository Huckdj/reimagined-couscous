const axios = require('axios');
const colors = require('colors/safe');

const API_KEY = 'b4f665ad2cead2b1b7fb376bee8d3931';
const SITE_KEY = '6LcItOMqAAAAAF9ANohQEN4jGOjHRxU8f5MNJZHu';
const PAGE_URL = 'https://testnet.monad.xyz/';

function log(msg, type = 'info') {
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

async function solveCaptcha() {
    try {
        log('[Captcha] Gửi yêu cầu đến 2Captcha...', 'info');
        const submitResponse = await axios.get('https://2captcha.com/in.php', {
            params: {
                key: API_KEY,
                method: 'userrecaptcha',
                googlekey: SITE_KEY,
                pageurl: PAGE_URL,
                json: 1
            }
        });

        if (submitResponse.data.status !== 1) {
            throw new Error(`Lỗi khi gửi captcha: ${submitResponse.data.error_text}`);
        }

        const captchaId = submitResponse.data.request;
        log(`[Captcha] Captcha ID: ${captchaId}. Đang đợi kết quả...`, 'custom');

        let solution = null;
        let waitTime = 5000;
        let maxAttempts = 30;

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, waitTime));

            const resultResponse = await axios.get('https://2captcha.com/res.php', {
                params: {
                    key: API_KEY,
                    action: 'get',
                    id: captchaId,
                    json: 1
                }
            });

            if (resultResponse.data.status === 1) {
                solution = resultResponse.data.request;
                log(`[Captcha] Captcha đã được giải thành công!`, 'success');
                break;
            }

            if (resultResponse.data.request === 'ERROR_CAPTCHA_UNSOLVABLE') {
                throw new Error('[Captcha] Captcha không thể giải!');
            }

            if (resultResponse.data.request === 'CAPCHA_NOT_READY') {
                log(`[Captcha] Chưa có kết quả, thử lại sau ${waitTime / 1000}s...`, 'warning');
            } else {
                log(`[Captcha] Lỗi khác từ 2Captcha: ${resultResponse.data.request}`, 'error');
            }

            waitTime = Math.min(waitTime + 2000, 15000);
        }

        if (!solution) {
            throw new Error('[Captcha] Hết thời gian chờ, không nhận được kết quả');
        }

        return { data: solution };

    } catch (error) {
        log(`[Captcha] Lỗi solveCaptcha: ${error.message}`, 'error');
        return { error: error.message };
    }
}

module.exports = solveCaptcha;