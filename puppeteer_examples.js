const cron = require('node-cron');
const puppeteer = require('puppeteer');
const ocr = require('./ocr');

const solveCaptcha = async (page) => {
  // ... (önceki solveCaptcha fonksiyonu aynı kalıyor)
};

const closePopupIfExists = async (page, selector) => {
  // ... (önceki closePopupIfExists fonksiyonu aynı kalıyor)
};

const checkAndSelectSession = async (page, day, sessionIndex) => {
  const selector = `#pageContent_rptListe_ChildRepeater_${day}_cboxSeans_${sessionIndex}`;
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    const isEnabled = await page.$eval(selector, el => !el.disabled);
    if (isEnabled) {
      await page.click(selector);
      console.log(`Seans seçildi: ${selector}`);
      return true;
    } else {
      console.log(`Seans aktif değil: ${selector}`);
      return false;
    }
  } catch (error) {
    console.log(`Seans bulunamadı veya seçilemedi: ${selector}`);
    return false;
  }
};

const main = async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    slowMo: 50,
    args: ["--start-maximized"]
  });

  const page = (await browser.pages())[0];

  try {
    await page.goto("https://online.spor.istanbul/uyegiris");

    await page.type('[id=txtTCPasaport]', '16915452902');
    await page.type('[id=txtSifre]', '26481037');
    await page.click('#btnGirisYap');

    await closePopupIfExists(page, '#closeModal');

    await page.goto("https://online.spor.istanbul/uyespor", { waitUntil: 'networkidle2' });
    await closePopupIfExists(page, '#closeModal');

    const today = new Date().getDay(); // 0 = Pazar, 1 = Pazartesi, ..., 6 = Cumartesi
    let sessionSelected = false;

    // Salı için (Cumartesi günü kontrol)
    if (today === 6) {
      sessionSelected = await checkAndSelectSession(page, 2, 0) || await checkAndSelectSession(page, 2, 1);
    }
    // Perşembe için (Pazartesi günü kontrol)
    else if (today === 1) {
      sessionSelected = await checkAndSelectSession(page, 4, 0) || await checkAndSelectSession(page, 4, 1);
    }
    // Cumartesi için (Çarşamba günü kontrol)
    else if (today === 3) {
      sessionSelected = await checkAndSelectSession(page, 6, 0) || await checkAndSelectSession(page, 6, 1);
    }

    if (!sessionSelected) {
      console.log('Uygun seans bulunamadı veya seçilemedi.');
      return;
    }

    const maxAttempts = 15;
    let captchaSolved = false;
    let attempts = 0;

    while (!captchaSolved && attempts < maxAttempts) {
      await closePopupIfExists(page, '#closeModal');

      try {
        const captchaValue = await solveCaptcha(page);
        await page.evaluate(() => {
          document.querySelector('#pageContent_txtCaptchaText').value = '';
        });
        await page.type('#pageContent_txtCaptchaText', captchaValue);
        await page.click('#lbtnKaydet');

        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        const isCaptchaSolved = await page.evaluate(() => document.querySelector('#captchaErrorMessage') === null);

        if (isCaptchaSolved) {
          captchaSolved = true;
          console.log('Captcha başarıyla çözüldü ve kayıt tamamlandı.');
        } else {
          console.log('Captcha çözme başarısız, sayfa yenileniyor...');
          await page.reload({ waitUntil: 'networkidle2' });
          await closePopupIfExists(page, '#closeModal');
        }
      } catch (error) {
        console.error(`Captcha çözme hatası: ${error.message}`);
        await page.reload({ waitUntil: 'networkidle2' });
        await closePopupIfExists(page, '#closeModal');
      }

      attempts++;
      if (!captchaSolved) {
        console.log(`Captcha çözme denemesi (${attempts}/${maxAttempts})`);
      }
    }

    if (!captchaSolved) {
      console.error('Captcha çözme denemeleri tükendi, işlemi sonlandırılıyor.');
    }

  } finally {
    await browser.close();
  }
};

// Cron job'ları oluştur
cron.schedule('1 0 * * 1', async () => { // Pazartesi 00:00
  console.log('Pazartesi 00:00 - Perşembe seansları için cron job başlatılıyor...');
  try {
    await main();
  } catch (error) {
    console.error('Cron job sırasında hata oluştu:', error);
  }
});

cron.schedule('1 0 * * 3', async () => { // Çarşamba 00:00
  console.log('Çarşamba 00:00 - Cumartesi seansları için cron job başlatılıyor...');
  try {
    await main();
  } catch (error) {
    console.error('Cron job sırasında hata oluştu:', error);
  }
});

cron.schedule('1 0 * * 6', async () => { // Cumartesi 00:00
  console.log('Cumartesi 00:00 - Salı seansları için cron job başlatılıyor...');
  try {
    await main();
  } catch (error) {
    console.error('Cron job sırasında hata oluştu:', error);
  }
});

console.log('Cronn job\'lar planlandı. Belirtilen günlerde ve saatlerde çalışacak.');