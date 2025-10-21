const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function optimizeImage(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .webp({ quality: 80 })
      .toFile(outputPath);
    console.log(`Optimized ${inputPath} to ${outputPath}`);
  } catch (error) {
    console.error(`Error optimizing ${inputPath}:`, error);
  }
}

async function optimizeImages() {
  const publicImagesDir = path.join(__dirname, '../../public/images');
  const distImagesDir = path.join(__dirname, '../../dist/images');

  // Create dist/images directory if it doesn't exist
  if (!fs.existsSync(distImagesDir)) {
    fs.mkdirSync(distImagesDir, { recursive: true });
  }

  // Optimize hero.jpg and logo.jpg to WebP
  const images = ['hero.jpg', 'logo.jpg'];

  for (const image of images) {
    const inputPath = path.join(publicImagesDir, image);
    const outputPath = path.join(distImagesDir, image.replace('.jpg', '.webp'));
    if (fs.existsSync(inputPath)) {
      await optimizeImage(inputPath, outputPath);
    }
  }

  console.log('Image optimization completed!');
}

optimizeImages().catch(console.error);
