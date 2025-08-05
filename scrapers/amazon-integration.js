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
   bat_variants (
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

    let allProducts = [];

    // STEP 1: Process stored ASINs if available
    if (variantASINs.length > 0) {
      console.log(`   📌 Using ${variantASINs.length} stored variant ASINs`);
      
      // Batch ASINs into chunks of 10 (Amazon API limit)
      const chunks = [];
      for (let i = 0; i < variantASINs.length; i += 10) {
        chunks.push(variantASINs.slice(i, i + 10));
      }
      
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
      }
    }

    // STEP 2: Check if we need to discover more variants (gap-filling)
    const variantsWithoutASINs = batModel.variants.filter(v => !v.asin || v.asin.trim() === '');
    const needsDiscovery = variantsWithoutASINs.length > 0 || (batModel.variants.length === 0 && batModel.amazon_asin);

    if (needsDiscovery) {
    console.log(`   🔍 ${variantsWithoutASINs.length} variants still need ASINs - running discovery`);
    
    // Use seed ASIN for discovery
    if (batModel.amazon_asin) {
      console.log(`   🔍 Discovering variants from seed ASIN: ${batModel.amazon_asin}`);
      
      // Skip individual seed ASIN fetch - it comes with variations with proper attributes
      
      // Get all size/length variations
      console.log(`   🔍 Looking for size variations...`);
      const variations = await this.apiClient.getVariations(batModel.amazon_asin);
      
      // Add variations that we don't already have
      if (variations && variations.length > 0) {
        variations.forEach(variation => {
          if (!allProducts.find(p => p.ASIN === variation.ASIN)) {
            allProducts.push(variation);
          }
        });
      }

      if (variations && variations.length > 0) {
        console.log(`   ✅ Total products after discovery: ${allProducts.length} (stored + discovered)`);
        console.log('\n🐛 DEBUG: All product titles after discovery:');
        allProducts.forEach((product, i) => {
          console.log(`  [${i}] ${product.ASIN}: ${product.ItemInfo?.Title?.DisplayValue}`);
        });

        // IMPORTANT: Store newly discovered ASINs for future use
        await this.storeVariantASINs(batModel, allProducts);
      }
    } else if (allProducts.length === 0) {
      // Only fall back to search if we have no products at all
      console.log(`   🔎 No seed ASIN available - falling back to search`);
      return await this.performSearchFallback(batModel);
    }
    }
    
    // STEP 3: Process all products we have
    if (allProducts.length === 0) {
      console.log(`   🔎 No ASINs available - falling back to search`);
      return await this.performSearchFallback(batModel);
    }

    // Return all products for processing
    return allProducts.map(product => ({
      ...this.mapper.scoreProductMatch(product, batModel),
      product: product
    }));
    
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
   
   // STEP 1: Determine the seed colorway from the first product
   let seedColorway = null;
   if (amazonProducts.length > 0) {
     const seedProduct = amazonProducts[0];
     
     // If seed doesn't have VariationAttributes, get them
     if (!seedProduct.VariationAttributes) {
       const variations = await this.apiClient.getVariations(seedProduct.ASIN);
       if (variations && variations.length > 0) {
         // Use first variation that has VariationAttributes
         const varWithAttrs = variations.find(v => v.VariationAttributes);
         if (varWithAttrs) {
           seedColorway = this.mapper.extractColorway(varWithAttrs);
         }
       }
     } else {
       seedColorway = this.mapper.extractColorway(seedProduct);
     }
     
     console.log(`🎨 Seed colorway detected: "${seedColorway}"`);
   }
   
   let storedCount = 0;
   let skippedCount = 0;
   
   for (const product of amazonProducts) {
    // Skip stored ASINs - they're only for pricing
    const isStoredASIN = batModel.variants.some(v => v.asin === product.ASIN);
    if (isStoredASIN) {
      console.log(`     ⏭️ Skipping stored ASIN ${product.ASIN} - pricing only`);
      continue;
    }
    
    // Skip seed ASIN ONLY if it doesn't have VariationAttributes
    if (product.ASIN === batModel.amazon_asin && !product.VariationAttributes) {
      console.log(`     ⏭️ Skipping seed ASIN ${product.ASIN} - no VariationAttributes`);
      continue;
    }
     const extractedInfo = this.mapper.extractBatInfo(product);
     const variants = extractedInfo.variants || [];

    
     
     // STEP 2: Check if this product matches the seed colorway
     if (seedColorway) {
       const productColorway = this.mapper.extractColorway(product);
       
       // Always allow seed ASIN, otherwise check colorway match
       if (product.ASIN !== batModel.amazon_asin && productColorway !== seedColorway) {
         console.log(`     🎨 Skipping different colorway: "${productColorway}" (expected: "${seedColorway}")`);
         skippedCount++;
         continue;
       }
     }
     
     // STEP 3: Store matching variants OR create missing ones
     for (const variant of variants) {
       // Find matching database variant by length, drop, and weight
       let matchingVariant = batModel.variants.find(dbVariant => {
         const lengthMatch = dbVariant.length === variant.length;
         const dropMatch = dbVariant.drop === variant.drop;
         return lengthMatch && dropMatch;
       });

       // If no matching variant exists, create it
       if (!matchingVariant) {
         console.log(`     🆕 Creating missing variant: ${variant.length}" ${variant.weight}oz ${variant.drop}`);
         
         const newVariantId = await this.createMissingVariant(batModel.id, variant);
         if (newVariantId) {
           // Add to batModel.variants array so we can reference it
           matchingVariant = {
             id: newVariantId,
             length: variant.length,
             weight: variant.weight,
             drop: variant.drop,
             asin: null
           };
           batModel.variants.push(matchingVariant);
           console.log(`     ✅ Created and added variant ID: ${newVariantId}`);
         }
       }
       
       // Store ASIN if variant exists and doesn't have one
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
           console.log(`     ✅ Stored ASIN ${product.ASIN} for ${variant.length}" ${variant.drop}`);
           storedCount++;
           // Update the local variant object
           matchingVariant.asin = product.ASIN;
           
           // Add price for newly created variants
           if (matchingVariant.id >= 894) {
             try {
               const amazonRetailerId = await this.getAmazonRetailerId();
               const extractedInfo = this.mapper.extractBatInfo(product);
               
               if (extractedInfo.price) {
                 const priceUpdated = await this.updateVariantPrice(
                   matchingVariant.id,
                   extractedInfo.price,
                   extractedInfo.inStock,
                   amazonRetailerId,
                   `https://www.amazon.com/dp/${product.ASIN}?tag=battracker-20`
                 );
                 
                 if (priceUpdated) {
                   console.log(`     💰 Added price $${extractedInfo.price} for new variant ${variant.length}" ${variant.drop}`);
                 }
               }
             } catch (priceError) {
               console.log(`     ⚠️ Error adding price for new variant: ${priceError.message}`);
             }
           }
         } else {
           console.log(`     ❌ Error storing ASIN: ${error.message}`);
         }
       }
     }
   }
   
   console.log(`   📊 Colorway filtering summary: ${storedCount} stored, ${skippedCount} skipped (different colorway)`);
   
 } catch (error) {
   console.error(`   ❌ Error storing variant ASINs: ${error.message}`);
 }
}

// =============================================
// DATABASE UPDATE FUNCTIONS  
// =============================================

// Helper functions for intelligent product grouping
extractSeriesIdentifier(title) {
  if (!title) return 'unknown';
  
  return title
    .toLowerCase()
    .replace(/pool party|fire ice|blackout|whiteout|stealth|glow|electric|neon|ghost|platinum|cosmic|galaxy|vapor|phantom|carbon|chrome|flame|storm|thunder|lightning|sunset/g, '') // Remove special editions
    .replace(/\d{4}|\d{2,4}\s*inch?|usssa|bbcor|usa\s*baseball|-\d+|\d+["']/g, '') // Remove year, size, cert, drop
    .replace(/\|.*$/g, '') // Remove everything after pipe
    .replace(/\s+/g, ' ')
    .trim();
}

extractColorAttribute(product) {
  if (!product) return 'standard';
  
  // Try VariationAttributes first
  if (product.VariationAttributes) {
    const colorAttr = product.VariationAttributes.find(attr => 
      attr.Name === 'color_name' || attr.Name === 'color'
    );
    if (colorAttr && colorAttr.Value) {
      return colorAttr.Value.trim();
    }
  }
  
  // Fallback to title parsing for special colorways
  const title = product.ItemInfo?.Title?.DisplayValue || '';
  const specialColorways = ['pool party', 'fire ice', 'blackout', 'whiteout', 'stealth'];
  
  for (const colorway of specialColorways) {
    if (title.toLowerCase().includes(colorway)) {
      return colorway;
    }
  }
  
  return 'standard';
}

groupProducts(searchResults, seedAsin) {
  // Level 1: Try series-based grouping
  const seriesGroups = new Map();
  searchResults.forEach(result => {
    const seriesId = this.extractSeriesIdentifier(result.batInfo?.title || '');
    if (!seriesGroups.has(seriesId)) {
      seriesGroups.set(seriesId, []);
    }
    seriesGroups.get(seriesId).push(result);
  });
  
  // Check if series grouping is meaningful (distinct groups with meaningful names)
  const seriesKeys = Array.from(seriesGroups.keys()).filter(key => key.length > 3);
  const hasDistinctSeries = seriesKeys.length > 1;
  
  if (hasDistinctSeries) {
    console.log(`   📊 Using series-based grouping: ${seriesKeys.join(', ')}`);
    return seriesGroups;
  }
  
  // Level 2: Fallback to color-based grouping
  console.log(`   🎨 Series grouping unclear, falling back to color-based grouping`);
  const colorGroups = new Map();
  searchResults.forEach(result => {
    const colorId = this.extractColorAttribute(result.product);
    if (!colorGroups.has(colorId)) {
      colorGroups.set(colorId, []);
    }
    colorGroups.get(colorId).push(result);
  });
  
  const colorKeys = Array.from(colorGroups.keys());
  console.log(`   🎨 Color groups found: ${colorKeys.join(', ')}`);
  
  return colorGroups;
}

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

    // ===== INTELLIGENT PRODUCT GROUPING =====
    // Group products by series/color and find the group containing seed ASIN
    const productGroups = this.groupProducts(searchResults, databaseBat.amazon_asin);
    
    // Find group containing seed ASIN, or fallback to largest group
    let seedGroup = null;
    if (databaseBat.amazon_asin) {
      seedGroup = Array.from(productGroups.values()).find(group => 
        group.some(result => result.product?.ASIN === databaseBat.amazon_asin)
      );
    }
    
    // Fallback to the largest group if seed ASIN not found
    if (!seedGroup) {
      seedGroup = Array.from(productGroups.values())
        .sort((a, b) => b.length - a.length)[0] || [];
    }

    console.log(`   🎯 Processing ${seedGroup.length} variants from matching product group`);
    let filteredResults = seedGroup;

    // Process filtered variants and their pricing
    if (filteredResults.length >= 1) {
      console.log(`   📊 Processing ${filteredResults.length} product variants:`);
      
      for (let i = 0; i < filteredResults.length; i++) {
        const result = filteredResults[i];
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
            // Create missing variant - Amazon found size that JustBats doesn't carry
            console.log(`     🆕 Creating missing Amazon variant: ${amazonVariant.length} ${amazonVariant.drop}`);
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
      console.log(`   ⚠️  No matching product variants found after grouping`);
    }
    
    console.log(`   🎯 Successfully updated ${updatesCount} prices`);
    return updatesCount;
    
  } catch (error) {
    console.error(`❌ Error updating bat prices: ${error.message}`);
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
async function testAmazonIntegration() {
  const integration = new AmazonIntegration();
  
  console.log('🧪 TESTING Amazon API Integration');
  console.log('Running all bats...\n');
  
  try {
    await integration.run(); // Process all bats
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  }

// =============================================
// TEST FUNCTION SPECIFIC BAT MODEL ID
// =============================================

// async function testAmazonIntegration() {
//  const integration = new AmazonIntegration();
 
//  console.log('🧪 TESTING Amazon API Integration');
 
//  try {
//    const allBats = await integration.getAllBatModels();
//    console.log('Available bat IDs:', allBats.map(bat => bat.id));
   
   // ===== CHOOSE ONE: COMMENT OUT THE OTHER =====
   
  //  OPTION 1: Test single bat
  //  const testBat = allBats.find(bat => bat.id === 123); // Change ID as needed
  //  if (testBat) {
  //    console.log(`Testing single bat: ${testBat.brand} ${testBat.series} ${testBat.year}\n`);
  //    await integration.processBatModel(testBat);
  //  } else {
  //    console.log('❌ Bat with specified ID 123 not found');
  //  }
   
   // OPTION 2: Test multiple bats (Pool Party vs Standard)
//    const testBats = allBats.filter(bat => bat.id === 91 || bat.id === 92);
//    for (const testBat of testBats) {
//      console.log(`\nTesting bat: ${testBat.brand} ${testBat.series} ${testBat.year} (ID: ${testBat.id})`);
//      await integration.processBatModel(testBat);
//    }
   
   // Turn on with either test option
//  } catch (error) {
//    console.error('❌ Test failed:', error);
//  }
// }



// Export for use
module.exports = AmazonIntegration;

// Run test if executed directly
if (require.main === module) {
  testAmazonIntegration();
}