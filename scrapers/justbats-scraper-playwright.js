const { chromium } = require('playwright');
const { supabase } = require('./supabaseClient-node');

class JustBatsScraperPlaywright {
  constructor() {
    this.browser = null;
    this.page = null;
    this.retailerIds = {};
    this.results = {
      modelsProcessed: 0,
      pricesUpdated: 0,
      pricesAdded: 0,
      variantsCreated: 0,
      brokenUrls: 0,
      errors: 0,
      skipped: 0
    };
  }

  async init() {
    this.browser = await chromium.launch({
      headless: true // Set to true for production
    });
    
    // Create browser context with settings
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    this.page = await context.newPage();
    
    // Load retailer IDs
    await this.loadRetailerIds();
  }

  // =============================================
  // DATABASE FUNCTIONS
  // =============================================

  async loadRetailerIds() {
    try {
      const { data: retailers, error } = await supabase
        .from('retailers')
        .select('id, name');

      if (error) throw error;

      // Map retailer names to IDs
      retailers.forEach(retailer => {
        const name = retailer.name.toLowerCase();
        if (name.includes('justbats')) {
          this.retailerIds.justbats = retailer.id;
        } else if (name.includes('amazon')) {
          this.retailerIds.amazon = retailer.id;
        } else if (name.includes('dick')) {
          this.retailerIds.dicks = retailer.id;
        }
      });

      console.log(`✅ Loaded retailer IDs:`, this.retailerIds);
    } catch (error) {
      console.error('❌ Error loading retailer IDs:', error.message);
      throw error;
    }
  }

  async getAllBatModels() {
    try {
      console.log('\n📊 Fetching bat models with JustBats URLs...');
      
      const { data: batModels, error } = await supabase
        .from('bat_models')
        .select(`
          *,
          bat_variants (
            *,
            prices (
              *,
              retailers (id, name)
            )
          )
        `)
        .not('justbats_product_url', 'is', null)
        .eq('url_status', 'active')
        .order('id');

      if (error) throw error;

      console.log(`✅ Found ${batModels.length} bat models with JustBats URLs`);
      
      // Transform data for easier processing
      const transformedBats = batModels.map(bat => ({
        id: bat.id,
        brand: bat.brand,
        series: bat.series,
        year: bat.year,
        certification: bat.certification,
        material: bat.material,
        construction: bat.construction,
        barrel_size: bat.barrel_size,
        justbats_url: bat.justbats_product_url,
        variants: bat.bat_variants.map(variant => ({
          id: variant.id,
          length: variant.length,
          weight: variant.weight,
          drop: variant.drop,
          prices: variant.prices.map(price => ({
            id: price.id,
            retailer_id: price.retailer_id,
            retailer_name: price.retailers.name,
            price: price.price,
            in_stock: price.in_stock,
            last_updated: price.last_updated,
            previous_price: price.previous_price
          }))
        }))
      }));

      return transformedBats;
    } catch (error) {
      console.error('❌ Error fetching bat models:', error.message);
      throw error;
    }
  }

  async markUrlAsBroken(batModelId, errorMessage) {
    try {
      const { error } = await supabase
        .from('bat_models')
        .update({
          url_status: 'broken',
          url_last_verified: new Date().toISOString()
        })
        .eq('id', batModelId);
      
      if (!error) {
        console.log(`   🔗 Marked JustBats URL as broken for bat model ${batModelId}`);
        this.results.brokenUrls++;
      }
    } catch (error) {
      console.error(`   ❌ Error marking URL as broken:`, error.message);
    }
  }

  async createMissingVariant(batModelId, scrapedData) {
    try {
      console.log(`   🆕 Creating missing variant: ${scrapedData.length} ${scrapedData.weight} ${scrapedData.drop}`);
      
      const { data: newVariant, error } = await supabase
        .from('bat_variants')
        .insert([{
          bat_model_id: batModelId,
          length: scrapedData.length,
          weight: scrapedData.weight,
          drop: scrapedData.drop
        }])
        .select('id')
        .single();
      
      if (error) throw error;
      
      console.log(`   ✅ Created variant ID: ${newVariant.id}`);
      this.results.variantsCreated = (this.results.variantsCreated || 0) + 1;
      
      return newVariant.id;
    } catch (error) {
      console.error(`   ❌ Error creating variant:`, error.message);
      return null;
    }
  }

  async updateVariantPrice(variantId, scrapedData) {
    try {
      const justBatsRetailerId = this.retailerIds.justbats;
      if (!justBatsRetailerId) {
        console.log(`   ⚠️  No JustBats retailer ID found`);
        return false;
      }

      // Find existing price for this variant from JustBats
      const { data: existingPrices, error: fetchError } = await supabase
        .from('prices')
        .select('*')
        .eq('bat_variant_id', variantId)
        .eq('retailer_id', justBatsRetailerId);

      if (fetchError) throw fetchError;

      const existingPrice = existingPrices[0];

      if (existingPrice) {
        // Update existing price if different
        if (existingPrice.price !== scrapedData.price) {
          const { error } = await supabase
            .from('prices')
            .update({
              previous_price: existingPrice.price,
              price: scrapedData.price,
              in_stock: scrapedData.inStock,
              last_updated: new Date().toISOString(),
              price_change_date: new Date().toISOString(),
              price_change_percentage: ((scrapedData.price - existingPrice.price) / existingPrice.price * 100).toFixed(2)
            })
            .eq('id', existingPrice.id);
          
          if (!error) {
            console.log(`   ✅ Updated ${scrapedData.length} ${scrapedData.drop}: $${existingPrice.price} → $${scrapedData.price}`);
            this.results.pricesUpdated++;
            return true;
          } else {
            console.log(`   ❌ Error updating price: ${error.message}`);
            return false;
          }
        } else {
          // Price same, just update metadata
          await supabase
            .from('prices')
            .update({ 
              last_updated: new Date().toISOString(),
              in_stock: scrapedData.inStock
            })
            .eq('id', existingPrice.id);
          
          console.log(`   📌 Price unchanged for ${scrapedData.length} ${scrapedData.drop}: $${scrapedData.price}`);
          return true;
        }
      } else {
        // Insert new price
        const { error } = await supabase
          .from('prices')
          .insert([{
            bat_variant_id: variantId,
            retailer_id: justBatsRetailerId,
            price: scrapedData.price,
            in_stock: scrapedData.inStock,
            last_updated: new Date().toISOString()
          }]);
        
        if (!error) {
          console.log(`   ➕ Added new price for ${scrapedData.length} ${scrapedData.drop}: $${scrapedData.price}`);
          this.results.pricesAdded++;
          return true;
        } else {
          console.log(`   ❌ Error inserting price: ${error.message}`);
          return false;
        }
      }
    } catch (error) {
      console.error(`   ❌ Error updating variant price:`, error.message);
      return false;
    }
  }

  // =============================================
  // SCRAPING FUNCTIONS (Enhanced)
  // =============================================

  async processBatModel(batModel) {
    try {
      console.log(`\n🔍 Processing: ${batModel.brand} ${batModel.series} ${batModel.year}`);
      console.log(`📍 URL: ${batModel.justbats_url}`);
      
      // Navigate to the product URL
      try {
        await this.page.goto(batModel.justbats_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (error) {
        console.log(`   ❌ Failed to load URL: ${error.message}`);
        
        // Check if URL is broken
        if (error.message.includes('net::ERR_NAME_NOT_RESOLVED') || 
            error.message.includes('404') ||
            error.message.includes('Page not found')) {
          await this.markUrlAsBroken(batModel.id, error.message);
        }
        
        this.results.errors++;
        return;
      }
      
      // Wait a bit for dynamic content
      await this.randomDelay(1000, 2000);
      
      // Extract size-specific pricing
      const scrapedData = await this.extractSizeSpecificPricing(batModel.justbats_url);
      const sizeSpecificPricing = scrapedData.pricing || scrapedData;
      

      // Check if first variant is discontinued (from getSinglePrice)
        if (sizeSpecificPricing && sizeSpecificPricing.length === 1 && 
          sizeSpecificPricing[0].length === 'Standard' && 
          sizeSpecificPricing[0].discontinued === true) {
        console.log('   🚫 Marking all variants as out of stock due to discontinuation');
        for (const dbVariant of batModel.variants) {
          const existingPrice = dbVariant.prices.find(p => p.retailer_id === this.retailerIds.justbats);
          if (existingPrice) {
            console.log(`   📝 Updating variant ${dbVariant.length} ${dbVariant.drop} - setting in_stock to false`);
            const { error } = await supabase
              .from('prices')
              .update({ in_stock: false })
              .eq('id', existingPrice.id);

            console.log(`   📊 Database update error: ${error?.message || 'Success'}`);
          }
        }
        return; // Skip normal processing
        }

      // Extract and upload image if not already stored
      if (!batModel.image_url || batModel.image_url.includes('placeholder')) {
        const imageUrl = await this.extractProductImage();
        if (imageUrl) {
          const uploadedImageUrl = await this.downloadAndUploadImage(imageUrl, batModel.id, 'justbats');
          scrapedData.imageUrl = uploadedImageUrl;
          scrapedData.imageSource = 'justbats';
        }
}
      
      if (!sizeSpecificPricing || sizeSpecificPricing.length === 0) {
        console.log(`   ⚠️  No size variants found`);
        this.results.skipped++;
        return;
      }
      
      console.log(`   📊 Found ${sizeSpecificPricing.length} size variants`);
      
      // Match scraped variants to database variants and update prices
      let updatesCount = 0;
      
      for (const scrapedVariant of sizeSpecificPricing) {
        // Find matching database variant (now includes weight matching)
        const matchingVariant = batModel.variants.find(dbVariant => {
          const lengthMatch = dbVariant.length === scrapedVariant.length;
          const weightMatch = dbVariant.weight === scrapedVariant.weight;
          const dropMatch = dbVariant.drop === scrapedVariant.drop;
          return lengthMatch && weightMatch && dropMatch;
        });
        
        if (matchingVariant) {
          // Update existing variant
          const updated = await this.updateVariantPrice(matchingVariant.id, scrapedVariant);
          if (updated) updatesCount++;
        } else {
          // Create missing variant
          console.log(`   🔍 No matching variant found for ${scrapedVariant.length} ${scrapedVariant.weight} ${scrapedVariant.drop}`);
          const newVariantId = await this.createMissingVariant(batModel.id, scrapedVariant);
          
          if (newVariantId) {
            // Add price for the newly created variant
            const updated = await this.updateVariantPrice(newVariantId, scrapedVariant);
            if (updated) updatesCount++;
          }
        }
      }
      
      // Update URL verification timestamp and new extracted data
      const updateData = { url_last_verified: new Date().toISOString() };

      // Add model number and swing weight if extracted
      if (scrapedData.modelNumber) {
        updateData.model_number = scrapedData.modelNumber;
      }
      if (scrapedData.swingWeight) {
        updateData.swing_weight = scrapedData.swingWeight;
      }
      // Add image data if extracted
      if (scrapedData.imageUrl) {
        updateData.image_url = scrapedData.imageUrl;
        updateData.image_source = scrapedData.imageSource;
}

await supabase
  .from('bat_models')
  .update(updateData)
  .eq('id', batModel.id);
      
      console.log(`   🎯 Successfully updated ${updatesCount} prices`);
      this.results.modelsProcessed++;
      
    } catch (error) {
      console.error(`❌ Error processing ${batModel.brand} ${batModel.series}:`, error.message);
      this.results.errors++;
    }
  }

  async extractSizeSpecificPricing(productUrl) {
    try {
      console.log(`\n🔍 Extracting size-specific pricing from: ${productUrl}`);
      
      // Current page should already be loaded, but ensure we're on the right page
      const currentUrl = this.page.url();
      if (currentUrl !== productUrl) {
        await this.page.goto(productUrl, { waitUntil: 'domcontentloaded' });
      }
      
      // Wait for the page to load completely
      await this.page.waitForTimeout(3000);
      
      // Get basic product info
      const productTitle = await this.page.locator('h1, .product-title, .product-name').first().textContent().catch(() => 'Unknown Product');
      console.log(`📦 Product: ${productTitle}`);

      // Extract model number and swing weight
      const modelNumber = await this.extractModelNumber();
      const swingWeight = await this.extractSwingWeight();

      console.log(`📋 Model Number: ${modelNumber || 'Not found'}`);
      console.log(`⚖️ Swing Weight: ${swingWeight || 'Not found'}`);
      
  
      // Wait for radio button elements to be present
      try {
        await this.page.waitForSelector('.radio-wrapper.radio-button', { timeout: 5000 });
        console.log('✅ Radio button elements found');
      } catch (error) {
        console.log('⚠️  No radio button elements found immediately, checking broader selectors...');
      }
      
      // Extract size variants using enhanced logic
      const sizeVariants = await this.page.evaluate(() => {
        const debugInfo = [];
        debugInfo.push('🔍 PLAYWRIGHT: Starting size variant extraction...');
  
  // Check if product is discontinued at JustBats
  const discontinuedElements = document.querySelectorAll('*');
  let isJustBatsDiscontinued = false;
  
  for (const element of discontinuedElements) {
    const text = element.textContent || '';
    if (text.includes('DISCONTINUED')) {
      isJustBatsDiscontinued = true;
      break;
    }
  }
  
  if (isJustBatsDiscontinued) {
    debugInfo.push('⚠️ Product DISCONTINUED at JustBats - will mark all variants out of stock');
  }
  
  const variants = [];
  
  // Check all radio wrappers
  const allWrappers = document.querySelectorAll('.radio-wrapper.radio-button');
  

  const wrapperTexts = [];
  allWrappers.forEach((wrapper, i) => {
    const nameSpan = wrapper.querySelector('.name, span[class*="name"]');
    const sizeText = nameSpan ? nameSpan.textContent?.trim() : '';
    wrapperTexts.push(`${i + 1}. "${sizeText}"`);
  });
  
  // Filter out used options
  const radioWrappers = Array.from(allWrappers).filter(wrapper => {
    const text = wrapper.textContent.toLowerCase();
    return !text.includes('used') && !text.includes('refurbished');
  });

  
  
  if (radioWrappers.length > 0) {
    let hasIndividualPricing = false;
    
    // First pass: check if any variants have individual pricing
      radioWrappers.forEach((wrapper) => {
        const nameSpan = wrapper.querySelector('.name, span[class*="name"]');
        const sizeText = nameSpan ? nameSpan.textContent?.trim() : '';
        const priceSpan = wrapper.querySelector('.option-price, span[class*="price"]');
        const priceText = priceSpan ? priceSpan.textContent?.trim() : '';
        
        // Only count as individual pricing if BOTH size and price exist
        if (sizeText && priceText) {
          hasIndividualPricing = true;
        }
      });
    
    debugInfo.push(`Individual pricing detected: ${hasIndividualPricing}`);
    
    if (hasIndividualPricing) {
      // Original logic for individual pricing
      radioWrappers.forEach((wrapper, i) => {
        
        
        // Extract size text
        const nameSpan = wrapper.querySelector('.name, span[class*="name"]');
        const sizeText = nameSpan ? nameSpan.textContent?.trim() : '';
        
        // Skip used options (double check)
        if (sizeText.toLowerCase().includes('used') || 
            sizeText.toLowerCase().includes('refurbished')) {
          debugInfo.push(`   ⏭️  Skipping used option: ${sizeText}`);
          return;
        }
        
        // Extract price text
        const priceSpan = wrapper.querySelector('.option-price, span[class*="price"]');
        const priceText = priceSpan ? priceSpan.textContent?.trim() : '';
        
        // Extract radio input
        const radioInput = wrapper.querySelector('input[type="radio"]');
        const radioValue = radioInput ? radioInput.value : '';
        const radioName = radioInput ? radioInput.name : '';
        
        debugInfo.push(`   Size: "${sizeText}"`);
        debugInfo.push(`   Price: "${priceText}"`);
        debugInfo.push(`   Radio: name="${radioName}", value="${radioValue}"`);
        
        if (sizeText && priceText) {
          const priceMatch = priceText.match(/\$?(\d+(?:\.\d+)?)/);
          const price = priceMatch ? parseFloat(priceMatch[1]) : null;
          
          debugInfo.push(`✅ Adding variant "${sizeText}" - $${price}`);
          
          variants.push({
            text: sizeText,
            price: price,
            priceText: priceText, 
            radioValue: radioValue,
            radioName: radioName,
            discontinued: isJustBatsDiscontinued
          });
        } else {
          
        }
      });
    } else {
      // Single price for all variants
      
      
      // Get the main product price
      const mainPriceElements = document.querySelectorAll('.price, .product-price, .cost, .amount, [data-price]');
      let mainPrice = null;
      let mainPriceText = '';
      
      for (const priceEl of mainPriceElements) {
        const priceText = priceEl.textContent?.trim() || '';
        if (priceText.includes('$')) {
          const priceMatch = priceText.match(/\$(\d+(?:\.\d+)?)/);
          if (priceMatch) {
            mainPrice = parseFloat(priceMatch[1]);
            mainPriceText = priceText;
            break;
          }
        }
      }
      
      
      if (mainPrice) {
        // Extract all size options and apply main price
        radioWrappers.forEach((wrapper, i) => {
          debugInfo.push(`\nProcessing size option ${i + 1}:`);
          
          // Extract size text
          const nameSpan = wrapper.querySelector('.name, span[class*="name"]');
          const sizeText = nameSpan ? nameSpan.textContent?.trim() : '';
          
          // Skip used options (double check)
          if (sizeText.toLowerCase().includes('used') || 
              sizeText.toLowerCase().includes('refurbished')) {
            debugInfo.push(`   ⏭️  Skipping used option: ${sizeText}`);
            return;
          }
          
          // Extract radio input
          const radioInput = wrapper.querySelector('input[type="radio"]');
          const radioValue = radioInput ? radioInput.value : '';
          const radioName = radioInput ? radioInput.name : '';
  
          
          if (sizeText) {
            
            
            variants.push({
              text: sizeText,
              price: mainPrice,
              priceText: mainPriceText,
              radioValue: radioValue,
              radioName: radioName,
              discontinued: isJustBatsDiscontinued
            });
          } else {
            
          }
        });
      }
    }
  }
  
  
  
  return {
    debugInfo,
    wrapperTexts,
    variants,
    discontinued: isJustBatsDiscontinued
  };
});

// Log the debug info
sizeVariants.debugInfo.forEach(msg => console.log(msg));
console.log('\nWrapper details:');
sizeVariants.wrapperTexts.forEach(msg => console.log(msg));
      
      console.log(`📊 Extracted ${sizeVariants.variants.length} size variants`);
      
      if (sizeVariants.variants.length === 0) {
        // No variants found, get single price
        console.log('📝 No size variants found, getting single price...');
        const singlePrice = await this.getSinglePrice();
        return [{
          length: 'Standard',
          weight: null,
          drop: 'Standard',
          price: singlePrice.price,
          inStock: singlePrice.inStock,
          rawPriceText: singlePrice.rawPriceText,
          variantText: 'Standard',
          discontinued: singlePrice.discontinued || false
        }];
      }
      
      // Process each variant
      const pricingData = [];
      
      for (let i = 0; i < sizeVariants.variants.length; i++) {
        const variant = sizeVariants.variants[i];
        console.log(`\n🔄 Processing variant ${i + 1}/${sizeVariants.variants.length}: "${variant.text}"`);
        
        try {
          // Parse variant text
          const { length, weight, drop } = this.parseVariantText(variant.text);
          
          // Check stock status for this specific variant
const inStock = await this.checkVariantStock(variant);
console.log(`   📦 Stock check for ${variant.text}: ${inStock}`);

          pricingData.push({
            length: length,
            weight: weight,
            drop: drop,
            price: variant.price,
            inStock: !variant.discontinued && inStock,
            rawPriceText: variant.priceText,
            variantText: variant.text
          });
          
          console.log(`   ✅ Added: ${length} ${weight || drop}: $${variant.price}`);
          
        } catch (error) {
          console.log(`   ❌ Error processing variant: ${error.message}`);
        }
      }
      
      console.log(`\n🎯 Successfully processed ${pricingData.length} variants!`);
      pricingData.forEach((entry, i) => {
        console.log(`${i + 1}. ${entry.length} ${entry.weight || entry.drop}: $${entry.price}`);
      });
      
      return {
          pricing: pricingData,
          modelNumber: modelNumber,
          swingWeight: swingWeight
        };
      
    } catch (error) {
      console.error(`❌ Error extracting size-specific pricing: ${error.message}`);
      return [];
    }
  }


  async extractModelNumber() {
    try {
      // Look for model number in "Bat Properties" section
      const modelNumber = await this.page.evaluate(() => {
        // Strategy 1: Look for "Bat Properties" heading with model number
        const headings = document.querySelectorAll('h1, h2, h3, h4, .product-title, .bat-properties');
        for (const heading of headings) {
          const text = heading.textContent || '';
          if (text.toLowerCase().includes('bat properties') || text.toLowerCase().includes('baseball bat:')) {
            // Extract everything after the last colon
            const colonIndex = text.lastIndexOf(':');
            if (colonIndex !== -1) {
              const modelNum = text.substring(colonIndex + 1).trim();
              if (modelNum && modelNum.length > 2 && modelNum.length < 20) {
                return modelNum;
              }
            }
          }
        }
        
        // Strategy 2: Look for model number in product details/specifications
        const detailElements = document.querySelectorAll('.product-details td, .specifications td, .product-info td');
        for (const element of detailElements) {
          const text = element.textContent || '';
          // Look for patterns like "Model: ABC123" or "Item #: ABC123"
          const modelMatch = text.match(/(?:model|item\s*#|sku|part\s*#):\s*([A-Z0-9]+)/i);
          if (modelMatch) {
            return modelMatch[1].trim();
          }
        }
        
        // Strategy 3: Look in meta data or data attributes
        const metaModel = document.querySelector('[data-model], [data-sku]');
        if (metaModel) {
          return metaModel.getAttribute('data-model') || metaModel.getAttribute('data-sku');
        }
        
        return null;
      });
      
      return modelNumber;
    } catch (error) {
      console.log(`   ⚠️ Error extracting model number: ${error.message}`);
      return null;
    }
  }

  async extractSwingWeight() {
    try {
      // Look for swing weight in product specifications table
      const swingWeight = await this.page.evaluate(() => {
        // Strategy 1: Look for table rows with "Swing Weight" header
        const tableRows = document.querySelectorAll('tr');
        for (const row of tableRows) {
          const headerCell = row.querySelector('th');
          const dataCell = row.querySelector('td');
          
          if (headerCell && dataCell) {
            const headerText = headerCell.textContent || '';
            if (headerText.toLowerCase().includes('swing weight')) {
              const swingWeightText = dataCell.textContent || '';
              // Clean up and extract value (handle links like <a>Balanced</a>)
              const linkElement = dataCell.querySelector('a');
              const finalText = linkElement ? linkElement.textContent : swingWeightText;
              return finalText.trim();
            }
          }
        }
        
        // Strategy 2: Look for swing weight in definition lists
        const definitionTerms = document.querySelectorAll('dt');
        for (const dt of definitionTerms) {
          if (dt.textContent.toLowerCase().includes('swing weight')) {
            const dd = dt.nextElementSibling;
            if (dd && dd.tagName === 'DD') {
              return dd.textContent.trim();
            }
          }
        }
        
        // Strategy 3: Look for swing weight in product details sections
        const detailElements = document.querySelectorAll('.product-details, .specifications, .product-info');
        for (const section of detailElements) {
          const text = section.textContent || '';
          const swingMatch = text.match(/swing\s*weight:\s*([^,\n]+)/i);
          if (swingMatch) {
            return swingMatch[1].trim();
          }
        }
        
        return null;
      });
      
      return swingWeight;
    } catch (error) {
      console.log(`   ⚠️ Error extracting swing weight: ${error.message}`);
      return null;
    }
  }

  async extractProductImage() {
  try {
    const imageUrl = await this.page.evaluate(() => {
      // Look for the main product image - updated selectors based on HTML
      const selectors = [
  '.product-main-image img[src*="products"]:not([src*="logo"]):not([src*="badge"]):not([src*="bat-bros"])',
  '.main-image img[src*="products"]:not([src*="logo"]):not([src*="badge"]):not([src*="bat-bros"])',
  '.swiper-slide-active img[src*="products"]:not([src*="logo"]):not([src*="badge"]):not([src*="bat-bros"])',
  '.swiper-slide img[src*="products"]:not([src*="logo"]):not([src*="badge"]):not([src*="bat-bros"])',
  '.photos-swiper img[src*="products"]:not([src*="logo"]):not([src*="badge"]):not([src*="bat-bros"])',
  'img[src*="cloudfront.net/images/products"]:not([src*="logo"]):not([src*="badge"]):not([src*="bat-bros"])'
];
      
      for (const selector of selectors) {
        const img = document.querySelector(selector);
        if (img && img.src && !img.src.includes('placeholder') && img.src.includes('http')) {
          return img.src;
        }
      }
      
      return null;
    });
    
    return imageUrl;
  } catch (error) {
    console.log(`   ⚠️ Error extracting image: ${error.message}`);
    return null;
  }
}

  async downloadAndUploadImage(imageUrl, batModelId, retailer = 'justbats') {
    try {
      if (!imageUrl) return null;
      
      console.log(`   📸 Downloading image from: ${imageUrl}`);
      
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const buffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      const extension = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
      const filename = `${batModelId}_${retailer}.${extension}`;
      
      const { data, error } = await supabase.storage
        .from('bat-images')
        .upload(filename, uint8Array, {
          contentType: `image/${extension}`,
          upsert: true
        });
      
      if (error) throw error;
      
      const { data: publicUrl } = supabase.storage
        .from('bat-images')
        .getPublicUrl(filename);
      
      console.log(`   ✅ Image uploaded: ${filename}`);
      return publicUrl.publicUrl;
      
    } catch (error) {
      console.log(`   ❌ Error uploading image: ${error.message}`);
      return null;
    }
  }

  async getSinglePrice() {
 try {
   // Check if discontinued first
   const isDiscontinued = await this.page.evaluate(() => {
     // Check for specific discontinued elements
     const discontinuedByClass = document.querySelector('.discontinued-label, .discontinued');
     const discontinuedByText = document.body.textContent.includes('DISCONTINUED');
     return discontinuedByClass !== null || discontinuedByText;
   });
   
   if (isDiscontinued) {
     console.log('⚠️ Product DISCONTINUED at JustBats');
     return {
       price: null,
       inStock: false,
       rawPriceText: 'DISCONTINUED',
       discontinued: true
     };
   }
   
   const priceText = await this.page.locator('.price, .product-price, .cost, .amount, [data-price]').first().textContent().catch(() => '');
   
   let price = null;
   if (priceText) {
     if (priceText.includes(' - ')) {
       const prices = priceText.split(' - ');
       price = parseFloat(prices[0].replace(/[^0-9.]/g, ''));
     } else {
       price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
     }
   }
   
   // Check availability
   const availabilityText = await this.page.locator('.availability, .stock-status, .in-stock, .out-of-stock').first().textContent().catch(() => '');
   const inStock = !availabilityText.toLowerCase().includes('out of stock') && 
                  !availabilityText.toLowerCase().includes('unavailable');
   
   return {
     price: price,
     inStock: inStock,
     rawPriceText: priceText.trim(),
     discontinued: false
   };
 } catch (error) {
   console.error('Error getting single price:', error.message);
   return { price: null, inStock: true, rawPriceText: '', discontinued: false };
 }
}

  parseVariantText(variantText) {
    let length = 'Standard';
    let weight = null;
    let drop = null;
    
    if (!variantText || variantText === 'Standard') {
      return { length, weight, drop };
    }
    
    const text = variantText.trim();
    console.log(`   🔤 Parsing: "${text}"`);
    
    // Parse JustBats format: "29" 26 oz."
    const justBatsMatch = text.match(/(\d+(?:\.\d+)?)["']\s*(\d+(?:\.\d+)?)\s*oz\.?/i);
    if (justBatsMatch) {
      const lengthNum = parseFloat(justBatsMatch[1]);
      const weightNum = parseFloat(justBatsMatch[2]);
      
      length = lengthNum + '"';
      weight = weightNum + ' oz';
      drop = '-' + (lengthNum - weightNum);
      
      console.log(`   📏 Parsed: length="${length}", weight="${weight}", drop="${drop}"`);
      return { length, weight, drop };
    }
    
    // Fallback parsing
    const lengthMatch = text.match(/(\d+(?:\.\d+)?)["']/i);
    if (lengthMatch) {
      length = parseFloat(lengthMatch[1]) + '"';
    }
    
    const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*oz\.?/i);
    if (weightMatch) {
      weight = parseFloat(weightMatch[1]) + ' oz';
    }
    
    if (length !== 'Standard' && weight) {
      const lengthNum = parseFloat(length.replace('"', ''));
      const weightNum = parseFloat(weight.replace(' oz', ''));
      if (lengthNum && weightNum) {
        drop = '-' + (lengthNum - weightNum);
      }
    }
    
    console.log(`   📏 Parsed: length="${length}", weight="${weight}", drop="${drop}"`);
    return { length, weight, drop };
  }

  async checkVariantStock(variant) {
  console.log(`   🔍 Checking stock for variant: ${variant.text}, radioValue: ${variant.radioValue}`);
  try {
    const isInStock = await this.page.evaluate((radioValue) => {
      const radio = document.querySelector(`input[value="${radioValue}"]`);
      const quantity = radio?.getAttribute('data-quantity');
      return quantity !== '0';
    }, variant.radioValue);
    
    return isInStock;
  } catch (error) {
    return true;
  }
}

  async randomDelay(min = 1000, max = 3000) {
    const delay = Math.random() * (max - min) + min;
    await this.page.waitForTimeout(delay);
  }

  // =============================================
  // MAIN EXECUTION FUNCTION
  // =============================================

  async runPriceUpdates(limit = null) {
    try {
      console.log('🚀 Starting JustBats Price Updates...');
      
      // Get all bat models with URLs
      const batModels = await this.getAllBatModels();
      
      if (batModels.length === 0) {
        console.log('⚠️  No bat models with JustBats URLs found');
        console.log('💡 TIP: Add justbats_product_url to your bat_models table');
        return;
      }
      
      // Limit for testing
      const modelsToProcess = limit ? batModels.slice(0, limit) : batModels;
      
      console.log(`\n🚀 Processing ${modelsToProcess.length} bat models...`);
      console.log('='.repeat(60));
      
      // Process each bat model
      for (let i = 0; i < modelsToProcess.length; i++) {
        const batModel = modelsToProcess[i];
        
        console.log(`\n[${i + 1}/${modelsToProcess.length}] Processing bat model...`);
        
        await this.processBatModel(batModel);
        
        // Delay between bat models
        if (i < modelsToProcess.length - 1) {
          console.log('   ⏱️  Waiting before next bat...');
          await this.randomDelay(3000, 6000);
        }
      }
      
      // Print final results
      this.printResults();
      
    } catch (error) {
      console.error('❌ Fatal error in runPriceUpdates():', error.message);
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 JUSTBATS PRICE UPDATE COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 RESULTS SUMMARY:`);
    console.log(`   • Bat models processed: ${this.results.modelsProcessed}`);
    console.log(`   • Prices updated: ${this.results.pricesUpdated}`);
    console.log(`   • New prices added: ${this.results.pricesAdded}`);
    console.log(`   • Variants created: ${this.results.variantsCreated}`);
    console.log(`   • Broken URLs found: ${this.results.brokenUrls}`);
    console.log(`   • Errors encountered: ${this.results.errors}`);
    console.log(`   • Models skipped: ${this.results.skipped}`);
    console.log('='.repeat(60));
    
    if (this.results.pricesUpdated > 0) {
      console.log(`\n💰 TIP: ${this.results.pricesUpdated} prices were updated. Check the price_history view to see changes!`);
    }
    
    if (this.results.pricesAdded > 0) {
      console.log(`\n➕ TIP: ${this.results.pricesAdded} new prices were added!`);
    }
    
    if (this.results.variantsCreated > 0) {
      console.log(`\n🆕 TIP: ${this.results.variantsCreated} new variants were created automatically!`);
    }
    
    if (this.results.brokenUrls > 0) {
      console.log(`\n🔗 WARNING: ${this.results.brokenUrls} broken URLs found. Update the justbats_product_url for these bat models.`);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// =============================================
// TEST FUNCTION
// =============================================
async function testJustBatsUpdater() {
  const scraper = new JustBatsScraperPlaywright();
  await scraper.init();
  
  try {
    console.log('🧪 TESTING JustBats Database Price Updater');
    console.log('Running all bat models...\n');
    
    await scraper.runPriceUpdates(); // Process all bats
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await scraper.close();
    console.log('\n🏁 Test completed');
  }
}

// Export for use in other files
module.exports = JustBatsScraperPlaywright;

// Run test if executed directly
if (require.main === module) {
  testJustBatsUpdater();
}