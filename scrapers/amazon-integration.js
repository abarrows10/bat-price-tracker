const { supabase } = require('./supabaseClient-node');
const AmazonApiClient = require('./amazon-api-client');
const AmazonProductMapper = require('./amazon-product-mapper');

class AmazonIntegration {
 constructor() {
   this.apiClient = new AmazonApiClient();
   this.mapper = new AmazonProductMapper();
   this.results = {
     processed: 0,
     pricesUpdated: 0,
     pricesAdded: 0,
     variantsCreated: 0,
     newBatsFound: 0,
     errors: 0,
     skipped: 0
   };
 }

 validateAndSanitizePrice(price) {
   try {
     let numPrice = typeof price === 'string' ? parseFloat(price) : price;
     
     if (isNaN(numPrice) || !isFinite(numPrice)) {
       console.log(`   ⚠️  Invalid price value: ${price}`);
       return null;
     }
     
     if (numPrice < 0 || numPrice > 999999.99) {
       console.log(`   ⚠️  Price exceeds database limits: $${numPrice}`);
       return null;
     }
     
     return Math.round(numPrice * 100) / 100;
   } catch (error) {
     console.log(`   ⚠️  Error processing price ${price}: ${error.message}`);
     return null;
   }
 }

  // =============================================
  // DATABASE FUNCTIONS
  // =============================================

  async getAmazonRetailerId() {
    try {
      const { data: retailer, error } = await supabase
        .from('retailers')
        .select('id')
        .ilike('name', '%amazon%')
        .single();
      
      if (error || !retailer) {
        // Create Amazon retailer if it doesn't exist
        const { data: newRetailer, error: createError } = await supabase
          .from('retailers')
          .insert([{ 
            name: 'Amazon',
            website: 'https://amazon.com',
            affiliate_base_url: 'https://amazon.com/dp/'
          }])
          .select('id')
          .single();
        
        if (createError) throw createError;
        console.log(`✅ Created Amazon retailer with ID: ${newRetailer.id}`);
        return newRetailer.id;
      }
      
      return retailer.id;
    } catch (error) {
      console.error('❌ Error getting Amazon retailer ID:', error.message);
      throw error;
    }
  }

  async getAllBatModels() {
    try {
      console.log('\n📊 Fetching bat models from database...');
      
      const { data: batModels, error } = await supabase
 .from('bat_models')
 .select(`
   *,
   bat_variants!inner (
     id,
     bat_model_id,
     length,
     weight,
     drop,
     release_date,
     discontinued,
     created_at,
     asin,
     amazon_product_url,
     prices (
       *,
       retailers (id, name)
     )
   )
 `)
 .order('id');

      if (error) throw error;

      console.log(`✅ Found ${batModels.length} bat models in database`);
      
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
        amazon_asin: bat.amazon_asin,
        image_url: bat.image_url,
        variants: bat.bat_variants.map(variant => ({
          id: variant.id,
          length: variant.length,
          weight: variant.weight,
          drop: variant.drop,
          asin: variant.asin,
          amazonUrl: variant.amazon_product_url,
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

  // =============================================
  // SEARCH AND MATCHING FUNCTIONS
  // =============================================

  async searchForBatModel(batModel) {
  try {
    console.log(`\n🔍 Processing Amazon data for: ${batModel.brand} ${batModel.series} ${batModel.year}`);
    
    // Check if we have stored variant ASINs
    const variantASINs = batModel.variants
      .filter(v => v.asin && v.asin.trim() !== '')
      .map(v => v.asin);
    
      console.log(`   🔍 Checking for stored ASINs:`, batModel.variants.map(v => ({ id: v.id, asin: v.asin })));

    if (variantASINs.length > 0) {
  // PRIORITY 1: Use stored variant ASINs (existing bats)
  console.log(`   📌 Using ${variantASINs.length} stored variant ASINs`);
  
  // Batch ASINs into chunks of 10 (Amazon API limit)
  const chunks = [];
  for (let i = 0; i < variantASINs.length; i += 10) {
    chunks.push(variantASINs.slice(i, i + 10));
  }
  
  let allProducts = [];
  for (const chunk of chunks) {
    const products = await this.apiClient.getItems(chunk);
    if (products && products.length > 0) {
      allProducts.push(...products);
    }
  }
  
  if (allProducts.length > 0) {
    console.log('\n🐛 DEBUG: All stored ASIN titles:');
    allProducts.forEach((product, i) => {
      console.log(`  [${i}] ${product.ASIN}: ${product.ItemInfo?.Title?.DisplayValue}`);
    });
    
    console.log(`   ✅ Retrieved ${allProducts.length} products from stored ASINs`);
    return allProducts.map(product => ({
      ...this.mapper.scoreProductMatch(product, batModel),
      product: product
    }));
  } else {
    console.log(`   ⚠️  Stored ASINs returned no data - falling back to discovery`);
  }
}
    
    // PRIORITY 2: Use seed ASIN for discovery (new bats)
    if (batModel.amazon_asin) {
      console.log(`   🔍 Discovering variants from seed ASIN: ${batModel.amazon_asin}`);
      
      // Get the main product
      const products = await this.apiClient.getItems([batModel.amazon_asin]);
      
      // Get all size/length variations
      console.log(`   🔍 Looking for size variations...`);
      const variations = await this.apiClient.getVariations(batModel.amazon_asin);
      
      // Combine main product with variations
      const allProducts = [];
      if (products && products.length > 0) {
        allProducts.push(...products);
      }
      if (variations && variations.length > 0) {
        variations.forEach(variation => {
          if (!allProducts.find(p => p.ASIN === variation.ASIN)) {
            allProducts.push(variation);
          }
        });
      }

      if (allProducts.length > 0) {
        console.log(`   ✅ Found ${allProducts.length} total products (main + variations)`);
        console.log('\n🐛 DEBUG: All variation titles:');
        allProducts.forEach((product, i) => {
          console.log(`  [${i}] ${product.ASIN}: ${product.ItemInfo?.Title?.DisplayValue}`);
        });

        // IMPORTANT: Store discovered ASINs for future use
        await this.storeVariantASINs(batModel, allProducts);
        
        return allProducts.map(product => ({
          ...this.mapper.scoreProductMatch(product, batModel),
          product: product
        }));
      }
    }
    
    // PRIORITY 3: Search fallback
    console.log(`   🔎 No ASINs available - falling back to search`);
    return await this.performSearchFallback(batModel);
    
  } catch (error) {
    console.error(`❌ Error processing ${batModel.brand} ${batModel.series}:`, error.message);
    return [];
  }
}

  async performSearchFallback(batModel) {
    try {
      // Build search terms using the API client helper
      const searchTerms = this.apiClient.buildBatSearchTerms(batModel);
      
      let bestResults = [];
      let bestSearchTerm = '';
      
      // Try each search term until we get good results
      for (const searchInfo of searchTerms) {
        console.log(`   🔎 Searching: "${searchInfo.keywords}"`);
        
        const searchResults = await this.apiClient.searchItems(
          searchInfo.keywords, 
          searchInfo.options
        );
        
        if (searchResults.length === 0) {
          console.log(`   ⚠️  No results for "${searchInfo.keywords}"`);
          continue;
        }
        
        // Score each result against the database bat
        const scoredResults = searchResults.map(product => {
          const match = this.mapper.scoreProductMatch(product, batModel);
          return {
            ...match,
            product: product,
            searchTerm: searchInfo.keywords
          };
        });
        
        // Sort by score
        scoredResults.sort((a, b) => b.score - a.score);
        
        console.log(`   📊 Best result score: ${scoredResults[0]?.score || 0}`);
        
        // If we found a good match, use these results
        if (scoredResults[0]?.score >= 70) {
          bestResults = scoredResults;
          bestSearchTerm = searchInfo.keywords;
          break;
        }
        
        // Keep track of best results even if not great
        if (scoredResults[0]?.score > (bestResults[0]?.score || 0)) {
          bestResults = scoredResults;
          bestSearchTerm = searchInfo.keywords;
        }
        
        // Rate limiting is handled by the API client
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (bestResults.length > 0) {
        const bestMatch = bestResults[0];
        console.log(`   🎯 Best match: "${bestMatch.batInfo?.title?.substring(0, 60)}..." (Score: ${bestMatch.score})`);
        console.log(`   💰 Price: $${bestMatch.batInfo?.price || 'N/A'}`);
        
        // Store ASIN for future use
        if (bestMatch.batInfo?.asin && bestMatch.score >= 70) {
          await this.storeDiscoveredAsin(batModel.id, bestMatch.batInfo.asin);
        }
      }
      
      return bestResults;
      
    } catch (error) {
      console.error(`❌ Error in search fallback:`, error.message);
      return [];
    }
  }

  // Store newly discovered ASINs for future GetItems calls
  async storeVariantASINs(batModel, amazonProducts) {
  try {
    console.log(`   💾 Storing variant ASINs for future use...`);
    
    for (const product of amazonProducts) {
      const extractedInfo = this.mapper.extractBatInfo(product);
      const variants = extractedInfo.variants || [];
      
      for (const variant of variants) {
        // Find matching database variant by length, drop, and weight
        const matchingVariant = batModel.variants.find(dbVariant => {
          const lengthMatch = dbVariant.length === variant.length;
          const dropMatch = dbVariant.drop === variant.drop;
          // Optional weight match (in case weights differ slightly)
          return lengthMatch && dropMatch;
        });
        
        if (matchingVariant && !matchingVariant.asin) {
          // Store the ASIN for this variant
          const { error } = await supabase
            .from('bat_variants')
            .update({ 
              asin: product.ASIN,
              amazon_product_url: `https://www.amazon.com/dp/${product.ASIN}?tag=battracker-20`
            })
            .eq('id', matchingVariant.id);
          
          if (!error) {
            console.log(`     ✅ Stored ASIN ${product.ASIN} for ${variant.length} ${variant.drop}`);
          } else {
            console.log(`     ❌ Error storing ASIN: ${error.message}`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error(`   ❌ Error storing variant ASINs: ${error.message}`);
  }
}

  // =============================================
  // DATABASE UPDATE FUNCTIONS
  // =============================================

  async updateExistingBatPrices(databaseBat, searchResults) {
    try {
      const amazonRetailerId = await this.getAmazonRetailerId();
      let updatesCount = 0;
      
      console.log(`\n💰 Updating Amazon prices for ${databaseBat.brand} ${databaseBat.series} ${databaseBat.year}...`);
      
      if (!searchResults || searchResults.length === 0) {
        console.log('⚠️  No search results to process');
        return 0;
      }
      
      const bestMatch = searchResults[0];
      if (!bestMatch.isMatch || !bestMatch.batInfo) {
        console.log('⚠️  No valid match found for price update');
        return 0;
      }
      
      // Process ALL variants and their pricing
      if (searchResults.length > 1) {
        console.log(`   📊 Processing ${searchResults.length} product variants:`);
        
        for (let i = 0; i < searchResults.length; i++) {
          const result = searchResults[i];
          if (!result.isMatch || !result.batInfo) continue;
          
          const amazonBat = result.batInfo;
          console.log(`     ${i + 1}. ${amazonBat.title?.substring(0, 50)}... - ${amazonBat.price}`);
          
          // Process each variant's specific pricing
          for (const amazonVariant of amazonBat.variants) {
            // Find matching database variant
            const matchingVariant = databaseBat.variants.find(dbVariant => {
              const lengthMatch = dbVariant.length === amazonVariant.length;
              const dropMatch = dbVariant.drop === amazonVariant.drop;
              return lengthMatch && dropMatch;
            });
            
            if (matchingVariant) {
              // Update existing variant pricing
              const updated = await this.updateVariantPrice(
                matchingVariant.id, 
                amazonBat.price, 
                amazonBat.inStock, 
                amazonRetailerId,
                amazonBat.url
              );
              if (updated) updatesCount++;
            } else {
              // Create missing variant
              console.log(`     🔍 No matching variant found for ${amazonVariant.length} ${amazonVariant.drop}`);
              const newVariantId = await this.createMissingVariant(
                databaseBat.id, 
                amazonVariant
              );
              
              if (newVariantId) {
                // Add price for the newly created variant
                const updated = await this.updateVariantPrice(
                  newVariantId, 
                  amazonBat.price, 
                  amazonBat.inStock, 
                  amazonRetailerId,
                  amazonBat.url
                );
                if (updated) updatesCount++;
              }
            }
          }
        }
      } else {
        // Single product - original logic
        const amazonBat = bestMatch.batInfo;
      
      // Handle image download and upload if no image exists
      const updateData = {
        amazon_product_url: `https://www.amazon.com/dp/${amazonBat.asin}?tag=battracker-20`,
        amazon_asin: amazonBat.asin,
        url_last_verified: new Date().toISOString()
      };
      
      // Update rating and review count if available
      if (amazonBat.rating) {
        updateData.rating = amazonBat.rating;
      }
      if (amazonBat.reviewCount) {
        updateData.review_count = amazonBat.reviewCount;
      }
      
      // Check if we need to download and store an image (prioritize JustBats images)
      if (!databaseBat.image_url || databaseBat.image_url.includes('placeholder')) {
        if (amazonBat.images && amazonBat.images.primary) {
          console.log(`   📸 No image found, downloading from Amazon...`);
          const uploadedImageUrl = await this.downloadAndUploadImage(
            amazonBat.images.primary, 
            databaseBat.id, 
            'amazon'
          );
          if (uploadedImageUrl) {
            updateData.image_url = uploadedImageUrl;
            updateData.image_source = 'amazon';
            console.log(`   ✅ Image uploaded successfully`);
          }
        }
      } else {
        console.log(`   📸 Using existing image (likely from JustBats)`);
      }
      
      // Update bat model with Amazon data and possibly new image
      if (amazonBat.asin) {
        await supabase
          .from('bat_models')
          .update(updateData)
          .eq('id', databaseBat.id);
      }
      
        // Process variants and pricing for single product
        for (const amazonVariant of amazonBat.variants) {
          // Find matching database variant
          const matchingVariant = databaseBat.variants.find(dbVariant => {
            const lengthMatch = dbVariant.length === amazonVariant.length;
            const dropMatch = dbVariant.drop === amazonVariant.drop;
            return lengthMatch && dropMatch;
          });
          
          if (matchingVariant) {
            // Update existing variant pricing
            const updated = await this.updateVariantPrice(
              matchingVariant.id, 
              amazonBat.price, 
              amazonBat.inStock, 
              amazonRetailerId,
              amazonBat.url
            );
            if (updated) updatesCount++;
          } else {
            // Create missing variant
            console.log(`     🔍 No matching variant found for ${amazonVariant.length} ${amazonVariant.drop}`);
            const newVariantId = await this.createMissingVariant(
              databaseBat.id, 
              amazonVariant
            );
            
            if (newVariantId) {
              // Add price for the newly created variant
              const updated = await this.updateVariantPrice(
                newVariantId, 
                amazonBat.price, 
                amazonBat.inStock, 
                amazonRetailerId,
                amazonBat.url
              );
              if (updated) updatesCount++;
            }
          }
        }
      }
      
      return updatesCount;
    } catch (error) {
      console.error('❌ Error updating existing bat prices:', error.message);
      return 0;
    }
  }

  // Image download and upload functionality (same as JustBats scraper)
  async downloadAndUploadImage(imageUrl, batModelId, retailer = 'amazon') {
    try {
      if (!imageUrl) return null;
      
      console.log(`   📸 Downloading image from: ${imageUrl}`);
      
      // Use node's https module to download the image
      const https = require('https');
      const url = require('url');
      
      return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(imageUrl);
        const request = https.get({
          hostname: parsedUrl.hostname,
          path: parsedUrl.path,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        }, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }
          
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', async () => {
            try {
              const buffer = Buffer.concat(chunks);
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
              resolve(publicUrl.publicUrl);
              
            } catch (uploadError) {
              reject(uploadError);
            }
          });
        });
        
        request.on('error', reject);
        request.setTimeout(30000, () => {
          request.destroy();
          reject(new Error('Download timeout'));
        });
      });
      
    } catch (error) {
      console.log(`   ❌ Error uploading image: ${error.message}`);
      return null;
    }
  }

  async createMissingVariant(batModelId, amazonVariant) {
    try {
      console.log(`   🆕 Creating missing variant: ${amazonVariant.length} ${amazonVariant.weight} ${amazonVariant.drop}`);
      
      const { data: newVariant, error } = await supabase
        .from('bat_variants')
        .insert([{
          bat_model_id: batModelId,
          length: amazonVariant.length,
          weight: amazonVariant.weight,
          drop: amazonVariant.drop
        }])
        .select('id')
        .single();
      
      if (error) throw error;
      
      console.log(`   ✅ Created variant ID: ${newVariant.id}`);
      this.results.variantsCreated++;
      
      return newVariant.id;
    } catch (error) {
      console.error(`   ❌ Error creating variant:`, error.message);
      return null;
    }
  }

  async updateVariantPrice(variantId, price, inStock, retailerId, productUrl) {
  try {
    const validatedPrice = this.validateAndSanitizePrice(price);
    
    if (!validatedPrice && validatedPrice !== 0) {
      console.log(`   ⚠️  Skipping invalid price: ${price}`);
      return false;
    }

    const { data: existingPrices, error: fetchError } = await supabase
      .from('prices')
      .select('*')
      .eq('bat_variant_id', variantId)
      .eq('retailer_id', retailerId);

    if (fetchError) throw fetchError;

    const existingPrice = existingPrices[0];

    if (existingPrice) {
      if (Math.abs(existingPrice.price - validatedPrice) > 0.01) {
        
        let priceChangePercentage = null;
        if (existingPrice.price && existingPrice.price > 0) {
          priceChangePercentage = ((validatedPrice - existingPrice.price) / existingPrice.price * 100);
          priceChangePercentage = Math.round(priceChangePercentage * 100) / 100;
          
          if (Math.abs(priceChangePercentage) > 999999.99) {
            priceChangePercentage = priceChangePercentage > 0 ? 999999.99 : -999999.99;
          }
        }

        const { error } = await supabase
          .from('prices')
          .update({
            previous_price: this.validateAndSanitizePrice(existingPrice.price),
            price: validatedPrice,
            in_stock: inStock || true,
            last_updated: new Date().toISOString(),
            price_change_date: new Date().toISOString(),
            price_change_percentage: isNaN(priceChangePercentage) ? null : priceChangePercentage,
            product_url: productUrl
          })
          .eq('id', existingPrice.id);

        if (!error) {
          console.log(`   ✅ Updated price: $${existingPrice.price} → $${validatedPrice}`);
          this.results.pricesUpdated++;
          return true;
        } else {
          console.log(`   ❌ Error updating price: ${error.message}`);
          return false;
        }
      } else {
        const { error } = await supabase
          .from('prices')
          .update({ 
            last_updated: new Date().toISOString(),
            in_stock: inStock || true
          })
          .eq('id', existingPrice.id);
        
        if (!error) {
          console.log(`   📌 Price unchanged: $${validatedPrice}`);
          return true;
        } else {
          console.log(`   ❌ Error updating timestamp: ${error.message}`);
          return false;
        }
      }
    } else {
      const { error } = await supabase
        .from('prices')
        .insert([{
          bat_variant_id: variantId,
          retailer_id: retailerId,
          price: validatedPrice,
          in_stock: inStock || true,
          last_updated: new Date().toISOString(),
          product_url: productUrl
        }]);

      if (!error) {
        console.log(`   ➕ Added new Amazon price: $${validatedPrice}`);
        this.results.pricesUpdated++;
        return true;
      } else {
        console.log(`   ❌ Error inserting price: ${error.message}`);
        return false;
      }
    }
  } catch (error) {
    console.error(`   ❌ Error in updateVariantPrice:`, error.message);
    return false;
  }
}

  // =============================================
  // MAIN EXECUTION FUNCTIONS
  // =============================================

  async processBatModel(batModel) {
    try {
      this.results.processed++;
      
      console.log(`\n[${this.results.processed}] Processing: ${batModel.brand} ${batModel.series} ${batModel.year}`);
      
      // Search for the bat on Amazon (or use existing ASIN)
      const searchResults = await this.searchForBatModel(batModel);
      
      if (searchResults.length === 0) {
        console.log(`   ❌ No Amazon results found`);
        this.results.skipped++;
        return;
      }
      
      const bestMatch = searchResults[0];
      
      if (bestMatch.isMatch && bestMatch.score >= 70) {
        // Update existing bat prices
        const updates = await this.updateExistingBatPrices(batModel, searchResults);
        console.log(`   🎯 Successfully updated ${updates} prices`);
      } else {
        console.log(`   ⚠️  Match score too low (${bestMatch.score}) - skipping update`);
        this.results.skipped++;
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${batModel.brand} ${batModel.series}:`, error.message);
      this.results.errors++;
    }
  }

  async run(limit = null) {
    try {
      console.log('🚀 Starting Amazon Integration...');
      
      // Get all bat models
      const batModels = await this.getAllBatModels();
      
      if (batModels.length === 0) {
        console.log('⚠️  No bat models found in database');
        return;
      }
      
      // Apply limit for testing - start from index 16 (17th bat)
      const modelsToProcess = limit ? batModels.slice(16, 16 + limit) : batModels;
      
      console.log(`\n🚀 Processing ${modelsToProcess.length} bat models...`);
      console.log('='.repeat(60));
      
      // Process each bat model
      for (let i = 0; i < modelsToProcess.length; i++) {
        const batModel = modelsToProcess[i];
        
        await this.processBatModel(batModel);
        
        // Delay between bat models to respect rate limits
        if (i < modelsToProcess.length - 1) {
          console.log('   ⏱️  Rate limiting delay...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Print final results
      this.printResults();
      
    } catch (error) {
      console.error('❌ Fatal error in Amazon integration:', error.message);
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 AMAZON INTEGRATION COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 RESULTS SUMMARY:`);
    console.log(`   • Bat models processed: ${this.results.processed}`);
    console.log(`   • Prices updated: ${this.results.pricesUpdated}`);
    console.log(`   • New prices added: ${this.results.pricesAdded}`);
    console.log(`   • Variants created: ${this.results.variantsCreated}`);
    console.log(`   • New bats discovered: ${this.results.newBatsFound}`);
    console.log(`   • Errors encountered: ${this.results.errors}`);
    console.log(`   • Models skipped: ${this.results.skipped}`);
    console.log('='.repeat(60));
    
    if (this.results.pricesUpdated > 0) {
      console.log(`\n💰 TIP: ${this.results.pricesUpdated} Amazon prices were updated!`);
    }
    
    if (this.results.pricesAdded > 0) {
      console.log(`\n➕ TIP: ${this.results.pricesAdded} new Amazon prices were added!`);
    }
    
    if (this.results.variantsCreated > 0) {
      console.log(`\n🆕 TIP: ${this.results.variantsCreated} new variants were created automatically!`);
    }
  }
}

// =============================================
// TEST FUNCTION ALL BATS
// =============================================
//async function testAmazonIntegration() {
  //const integration = new AmazonIntegration();
  
  //console.log('🧪 TESTING Amazon API Integration');
  //console.log('Running all bats...\n');
  
  //try {
    //await integration.run(); // Process all bats
  //} catch (error) {
    //console.error('❌ Test failed:', error);
  //}
  //}

// =============================================
// TEST FUNCTION SPECIFIC BAT MODEL ID
// =============================================

async function testAmazonIntegration() {
  const integration = new AmazonIntegration();
  
  console.log('🧪 TESTING Amazon API Integration - Bat Model ID 62');
  
  try {
     //Get all bats and filter for ID 62
    const allBats = await integration.getAllBatModels();
    const testBat = allBats.find(bat => bat.id === 62);
    
    if (testBat) {
      console.log(`Testing single bat: ${testBat.brand} ${testBat.series} ${testBat.year}\n`);
      await integration.processBatModel(testBat);
    } else {
      console.log('❌ Bat with ID 62 not found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export for use
module.exports = AmazonIntegration;

// Run test if executed directly
if (require.main === module) {
  testAmazonIntegration();
}