const fs = require('fs');
const path = require('path');
const uglifyJS = require('uglify-js');
const cssnano = require('cssnano');
const postcss = require('postcss');

// Function to minify JS files
function minifyJS(inputPath, outputPath) {
  const code = fs.readFileSync(inputPath, 'utf8');
  const result = uglifyJS.minify(code);
  if (result.error) {
    console.error('Error minifying JS:', result.error);
    return;
  }
  fs.writeFileSync(outputPath, result.code);
  console.log(`Minified ${inputPath} to ${outputPath}`);
}

// Function to minify CSS files
async function minifyCSS(inputPath, outputPath) {
  const css = fs.readFileSync(inputPath, 'utf8');
  const result = await postcss([cssnano]).process(css, { from: inputPath, to: outputPath });
  fs.writeFileSync(outputPath, result.css);
  console.log(`Minified ${inputPath} to ${outputPath}`);
}

// Main build function
async function build() {
  const publicDir = path.join(__dirname, '../../public');
  const distDir = path.join(__dirname, '../../dist');

  // Create dist directory if it doesn't exist
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Minify JS files
  const jsFiles = [
    'js/app.js',
    'js/auth.js',
    'js/dashboard.js',
    'js/logout.js',
    'js/navbar-loader.js',
    'js/nutrition-logger.js',
    'js/profile.js',
    'js/reports.js',
    'js/role-guard.js',
    'js/schedule.js',
    'js/sleep-tracker.js',
    'js/timer.js',
    'js/view-statistics.js',
    'js/admin-dashboard.js',
    'js/admin-logs.js',
    'js/appointments.js',
    'js/bmi.js'
  ];

  jsFiles.forEach(file => {
    const inputPath = path.join(publicDir, file);
    const outputPath = path.join(distDir, file.replace('.js', '.min.js'));
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (fs.existsSync(inputPath)) {
      minifyJS(inputPath, outputPath);
    }
  });

  // Minify CSS files
  const cssFiles = ['styles/styles.css', 'styles/user-details-cards.css'];

  for (const file of cssFiles) {
    const inputPath = path.join(publicDir, file);
    const outputPath = path.join(distDir, file.replace('.css', '.min.css'));
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (fs.existsSync(inputPath)) {
      await minifyCSS(inputPath, outputPath);
    }
  }

  console.log('Build completed!');
}

build().catch(console.error);
