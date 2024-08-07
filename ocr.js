const Tesseract = require("tesseract.js");
const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");
const sharp = require('sharp');

// Resimler/ocr klasörünü oluştur
const ocrDir = path.join("Resimler", "ocr");
if (!fs.existsSync(ocrDir)) {
  fs.mkdirSync(ocrDir, { recursive: true });
}

const saveImage = async (imageBuffer, prefix) => {
  const timestamp = Date.now();
  const fileName = `${prefix}_${timestamp}.png`;
  const filePath = path.join(ocrDir, fileName);
  await fs.promises.writeFile(filePath, imageBuffer);
  console.log(`Resim kaydedildi: ${filePath}`);
  return filePath;
};

const enhanceImage = async (imageBuffer) => {
  return sharp(imageBuffer)
    .resize(1000, 1000, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .sharpen()
    .normalize()
    .gamma(1.5)
    .toBuffer();
};

const preprocessImage = async (imageBuffer) => {
  const enhancedBuffer = await enhanceImage(imageBuffer);
  const image = await Jimp.read(enhancedBuffer);
  const processedImage = image
    .greyscale()
    .contrast(1)
    .normalize()
    .blur(1)
    .threshold({ max: 200 })
    .invert();
  
  // Resmi 2 kat büyüt
  const width = image.getWidth();
  const height = image.getHeight();
  processedImage.resize(width * 2, height * 2);
  
  const processedBuffer = await processedImage.getBufferAsync(Jimp.MIME_PNG);
  await saveImage(processedBuffer, "preprocessed");
  
  return processedBuffer;
};

const preprocessImageVariations = async (imageBuffer) => {
  const enhancedBuffer = await enhanceImage(imageBuffer);
  const image = await Jimp.read(enhancedBuffer);
  const variations = [
    image.clone().greyscale().contrast(1).normalize(),
    image.clone().greyscale().threshold({ max: 200 }),
    image.clone().greyscale().invert().normalize(),
    image.clone().greyscale().blur(1).contrast(1).normalize(),
  ];

  const variationBuffers = await Promise.all(variations.map(async (variation, index) => {
    const buffer = await variation.getBufferAsync(Jimp.MIME_PNG);
    await saveImage(buffer, `variation_${index + 1}`);
    return buffer;
  }));

  return variationBuffers;
};

const ocr = async (imageBuffer) => {
  const result = await Tesseract.recognize(imageBuffer, "eng", {
    tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    tessedit_pageseg_mode: "7",
    tessjs_create_hocr: "0",
    tessjs_create_tsv: "0",
    tessedit_ocr_engine_mode: "1",
    tessedit_pageseg_mode: "13",
    preserve_interword_spaces: "0",
  });

  return result.data.text.replace(/\s+/g, '');
};

const validateAndCorrectResult = (result) => {
  const regex = /^[0-9A-Za-z]{6}$/;
  result = result.replace(/[^0-9A-Za-z]/g, '');
  result = result.slice(0, 6);
  
  if (regex.test(result)) {
    return result;
  }
  
  result = result
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/8/g, 'B')
    .replace(/5/g, 'S')
    .replace(/2/g, 'Z');
  
  return result;
};

const OCR = async (base64) => {
  const imageBuffer = Buffer.from(base64, "base64");
  await saveImage(imageBuffer, "original");

  const enhancedBuffer = await enhanceImage(imageBuffer);
  await saveImage(enhancedBuffer, "enhanced");

  const maxAttempts = 5;
  let results = [];

  // Standart ön işleme ile deneme
  const preprocessedBuffer = await preprocessImage(enhancedBuffer);
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await ocr(preprocessedBuffer);
      console.log(`Standard Attempt ${i + 1}: ${result}`);
      results.push(validateAndCorrectResult(result));
    } catch (error) {
      console.error(`Error in standard attempt ${i + 1}:`, error);
    }
  }

  // Farklı ön işleme varyasyonlarıyla deneme
  const variations = await preprocessImageVariations(enhancedBuffer);
  for (const [index, variationBuffer] of variations.entries()) {
    try {
      const result = await ocr(variationBuffer);
      console.log(`Variation Attempt ${index + 1}: ${result}`);
      results.push(validateAndCorrectResult(result));
    } catch (error) {
      console.error(`Error in variation attempt ${index + 1}:`, error);
    }
  }

  // En sık görülen sonucu seç
  const resultCounts = results.reduce((acc, curr) => {
    acc[curr] = (acc[curr] || 0) + 1;
    return acc;
  }, {});

  const bestResult = Object.entries(resultCounts).sort((a, b) => b[1] - a[1])[0][0];

  console.log(`Best result: ${bestResult}`);
  return bestResult;
};

module.exports = OCR;