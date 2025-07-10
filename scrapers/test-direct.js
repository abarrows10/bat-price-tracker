const puppeteer = require('puppeteer');

async function testDirectUrl() {
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null
  });
  
  const page = await browser.newPage();
  
  try {
    // Test with a known Amazon baseball bat URL
    const testUrl = 'https://www.amazon.com/s?k=louisville+slugger+atlas+bbcor&ref=nb_sb_noss';
    
    console.log('Navigating to Amazon search...');
    await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
    
    // Wait a bit for the page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check what we can see
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);
    
    // Try to find any products
    const productCount = await page.evaluate(() => {
      const products = document.querySelectorAll('[data-component-type="s-search-result"]');
      console.log('Found elements:', products.length);
      
      if (products.length > 0) {
        const firstProduct = products[0];
        const title = firstProduct.querySelector('h2 a span')?.textContent || 'No title found';
        console.log('First product title:', title);
        return { count: products.length, firstTitle: title };
      }
      
      return { count: 0, firstTitle: null };
    });
    
    console.log('Product results:', productCount);
    
    // Keep browser open for manual inspection
    console.log('\nBrowser will stay open for 30 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

testDirectUrl();