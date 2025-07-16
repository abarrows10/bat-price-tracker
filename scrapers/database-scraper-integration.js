const { supabase } = require('./supabaseClient');
const JustBatsScraperPlaywright = require('./justbats-scraper-playwright');

class DatabaseScraperIntegration {
  constructor() {
    this.scraper = new JustBatsScraperPlaywright();
    this.results = {
      processed: 0,
      pricesUpdated: 0,
      newBatsFound: 0,
      errors: 0,
      skipped: 0
    };
  }

  async init() {
    console.log('🚀 Initializing Database Scraper Integration...');
    await this.scraper.init();
    console.log('✅ Scraper initialized');
  }

  // =============================================
  // STEP 1: Get all existing bats from database
  // =============================================
  async getAllExistingBats() {
    try {
      console.log('\n📊 Fetching all existing bats from database...');
      
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
        .order('id');

      if (error) throw error;

      console.log(`✅ Found ${batModels.length} existing bat models in database`);
      
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
      console.error('❌ Error fetching existing bats:', error.message);
      throw error;
    }
  }

  // =============================================
  // STEP 2: Build search terms for each bat
  // =============================================
  buildSearchTerms(bat) {
    const searchTerms = [];
    
    // Primary search: year + brand + series + certification
    const primary = `${bat.year} ${bat.brand} ${bat.series} ${bat.certification}`;
    searchTerms.push({
      term: primary,
      type: 'primary',
      confidence: 100
    });
    
    // Secondary search: brand + series + certification (no year)
    const secondary = `${bat.brand} ${bat.series} ${bat.certification}`;
    if (secondary !== primary) {
      searchTerms.push({
        term: secondary,
        type: 'secondary',
        confidence: 80
      });
    }
    
    // Tertiary search: add "baseball bat" for better results
    const tertiary = `${bat.year} ${bat.brand} ${bat.series} ${bat.certification} baseball bat`;
    searchTerms.push({
      term: tertiary,
      type: 'tertiary',
      confidence: 90
    });
    
    return searchTerms;
  }

  // =============================================
  // STEP 3: Score search results against database bat
  // =============================================
  scoreSearchResult(scrapedBat, databaseBat) {
    let score = 0;
    const reasons = [];
    
    // Brand matching (critical)
    if (scrapedBat.title.toLowerCase().includes(databaseBat.brand.toLowerCase())) {
      score += 30;
      reasons.push(`Brand match: ${databaseBat.brand}`);
    }
    
    // Series matching (critical)
    if (scrapedBat.title.toLowerCase().includes(databaseBat.series.toLowerCase())) {
      score += 30;
      reasons.push(`Series match: ${databaseBat.series}`);
    }
    
    // Year matching (important)
    if (scrapedBat.title.includes(databaseBat.year.toString())) {
      score += 20;
      reasons.push(`Year match: ${databaseBat.year}`);
    }
    
    // Certification matching (important)
    if (scrapedBat.title.toLowerCase().includes(databaseBat.certification.toLowerCase())) {
      score += 15;
      reasons.push(`Certification match: ${databaseBat.certification}`);
    }
    
    // Baseball bat confirmation
    if (scrapedBat.title.toLowerCase().includes('bat')) {
      score += 5;
      reasons.push('Contains "bat"');
    }
    
    return {
      score,
      reasons,
      isMatch: score >= 70 // Threshold for considering it a match
    };
  }

  // =============================================
  // STEP 4: Get JustBats retailer ID
  // =============================================
  async getJustBatsRetailerId() {
    try {
      const { data: retailer, error } = await supabase
        .from('retailers')
        .select('id')
        .ilike('name', '%justbats%')
        .single();
      
      if (error || !retailer) {
        // Create JustBats retailer if it doesn't exist
        const { data: newRetailer, error: createError } = await supabase
          .from('retailers')
          .insert([{ name: 'JustBats' }])
          .select('id')
          .single();
        
        if (createError) throw createError;
        return newRetailer.id;
      }
      
      return retailer.id;
    } catch (error) {
      console.error('❌ Error getting JustBats retailer ID:', error.message);
      throw error;
    }
  }

  // =============================================
  // STEP 5: Update existing bat prices
  // =============================================
  async updateExistingBatPrices(databaseBat, scrapedResults) {
    try {
      const justBatsRetailerId = await this.getJustBatsRetailerId();
      let updatesCount = 0;
      
      console.log(`\n💰 Updating prices for ${databaseBat.brand} ${databaseBat.series} ${databaseBat.year}...`);
      
      // Get size-specific pricing from the best matched result
      const bestMatch = scrapedResults[0]; // Already sorted by score
      const sizeSpecificPricing = await this.scraper.extractSizeSpecificPricing(bestMatch.url);
      
      if (!sizeSpecificPricing || sizeSpecificPricing.length === 0) {
        console.log('⚠️  No size-specific pricing found');
        return 0;
      }
      
      // Match scraped sizes to database variants
      for (const scrapedVariant of sizeSpecificPricing) {
        // Find matching database variant
        const matchingVariant = databaseBat.variants.find(dbVariant => {
          const lengthMatch = dbVariant.length === scrapedVariant.length;
          const dropMatch = dbVariant.drop === scrapedVariant.drop;
          return lengthMatch && dropMatch;
        });
        
        if (matchingVariant) {
          // Check if price exists for JustBats
          const existingPrice = matchingVariant.prices.find(p => p.retailer_id === justBatsRetailerId);
          
          if (existingPrice) {
            // Update existing price if different
            if (existingPrice.price !== scrapedVariant.price) {
              const { error } = await supabase
                .from('prices')
                .update({
                  previous_price: existingPrice.price,
                  price: scrapedVariant.price,
                  in_stock: scrapedVariant.inStock,
                  last_updated: new Date().toISOString(),
                  price_change_date: new Date().toISOString(),
                  price_change_percentage: ((scrapedVariant.price - existingPrice.price) / existingPrice.price * 100).toFixed(2)
                })
                .eq('id', existingPrice.id);
              
              if (!error) {
                console.log(`   ✅ Updated ${scrapedVariant.length} ${scrapedVariant.drop}: $${existingPrice.price} → $${scrapedVariant.price}`);
                updatesCount++;
              } else {
                console.log(`   ❌ Error updating price: ${error.message}`);
              }
            } else {
              // Price same, just update last_updated
              await supabase
                .from('prices')
                .update({ 
                  last_updated: new Date().toISOString(),
                  in_stock: scrapedVariant.inStock 
                })
                .eq('id', existingPrice.id);
              
              console.log(`   📌 Price unchanged for ${scrapedVariant.length} ${scrapedVariant.drop}: $${scrapedVariant.price}`);
            }
          } else {
            // Insert new price for this retailer
            const { error } = await supabase
              .from('prices')
              .insert([{
                bat_variant_id: matchingVariant.id,
                retailer_id: justBatsRetailerId,
                price: scrapedVariant.price,
                in_stock: scrapedVariant.inStock,
                last_updated: new Date().toISOString()
              }]);
            
            if (!error) {
              console.log(`   ➕ Added new price for ${scrapedVariant.length} ${scrapedVariant.drop}: $${scrapedVariant.price}`);
              updatesCount++;
            } else {
              console.log(`   ❌ Error inserting price: ${error.message}`);
            }
          }
        } else {
          console.log(`   ⚠️  No matching variant found for ${scrapedVariant.length} ${scrapedVariant.drop}`);
        }
      }
      
      return updatesCount;
    } catch (error) {
      console.error('❌ Error updating existing bat prices:', error.message);
      return 0;
    }
  }

  // =============================================
  // STEP 6: Add new bat discovery to pending tables
  // =============================================
  async addToPendingTables(scrapedBat, searchTerm, confidence) {
    try {
      console.log(`\n🆕 Adding new bat discovery to pending tables...`);
      console.log(`   Title: ${scrapedBat.title}`);
      console.log(`   Confidence: ${confidence}%`);
      
      // Extract brand and series from title (basic parsing)
      const { brand, series, year, certification } = this.parseBatTitle(scrapedBat.title);
      
      // Insert into pending_bats
      const { data: pendingBat, error: pendingBatError } = await supabase
        .from('pending_bats')
        .insert([{
          brand: brand,
          series: series,
          year: year,
          certification: certification,
          discovery_search_term: searchTerm,
          discovery_url: scrapedBat.url,
          discovery_confidence_score: confidence,
          discovered_by_scraper: 'justbats'
        }])
        .select('id')
        .single();
      
      if (pendingBatError) throw pendingBatError;
      
      console.log(`   ✅ Added to pending_bats with ID: ${pendingBat.id}`);
      
      // Get size-specific pricing
      const sizeSpecificPricing = await this.scraper.extractSizeSpecificPricing(scrapedBat.url);
      
      if (sizeSpecificPricing && sizeSpecificPricing.length > 0) {
        const justBatsRetailerId = await this.getJustBatsRetailerId();
        
        for (const variant of sizeSpecificPricing) {
          // Insert variant
          const { data: pendingVariant, error: variantError } = await supabase
            .from('pending_bat_variants')
            .insert([{
              pending_bat_id: pendingBat.id,
              length: variant.length,
              weight: variant.weight,
              drop: variant.drop,
              raw_variant_text: variant.variantText,
              discovered_by_scraper: 'justbats',
              discovery_confidence: 90
            }])
            .select('id')
            .single();
          
          if (variantError) {
            console.log(`   ⚠️  Error adding variant: ${variantError.message}`);
            continue;
          }
          
          // Insert price
          const { error: priceError } = await supabase
            .from('pending_prices')
            .insert([{
              pending_bat_variant_id: pendingVariant.id,
              retailer_id: justBatsRetailerId,
              price: variant.price,
              in_stock: variant.inStock,
              product_url: scrapedBat.url,
              scraper_source: 'justbats',
              raw_price_text: variant.rawPriceText,
              scraped_product_title: scrapedBat.title,
              price_confidence: 90
            }]);
          
          if (!priceError) {
            console.log(`   ✅ Added variant ${variant.length} ${variant.drop}: $${variant.price}`);
          } else {
            console.log(`   ⚠️  Error adding price: ${priceError.message}`);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error adding to pending tables:', error.message);
      return false;
    }
  }

  // =============================================
  // STEP 7: Parse bat title to extract information
  // =============================================
  parseBatTitle(title) {
    const titleLower = title.toLowerCase();
    
    // Extract year (look for 2020-2030)
    const yearMatch = title.match(/20(2[0-9]|3[0])/);
    const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
    
    // Extract certification
    let certification = 'BBCOR'; // default
    if (titleLower.includes('usssa')) certification = 'USSSA';
    if (titleLower.includes('usa baseball') || titleLower.includes('usab')) certification = 'USA Baseball';
    
    // Extract brand (common brands)
    let brand = 'Unknown';
    if (titleLower.includes('louisville slugger') || titleLower.includes('slugger')) brand = 'Louisville Slugger';
    if (titleLower.includes('easton')) brand = 'Easton';
    if (titleLower.includes('rawlings')) brand = 'Rawlings';
    if (titleLower.includes('demarini')) brand = 'DeMarini';
    if (titleLower.includes('marucci')) brand = 'Marucci';
    if (titleLower.includes('victus')) brand = 'Victus';
    
    // Extract series (everything after brand, before year/certification)
    let series = 'Unknown';
    const words = title.split(' ');
    // This is basic - you might want to improve this logic
    const brandWords = brand.split(' ').length;
    if (words.length > brandWords + 1) {
      series = words.slice(brandWords, brandWords + 2).join(' ');
    }
    
    return { brand, series, year, certification };
  }

  // =============================================
  // STEP 8: Process a single bat model
  // =============================================
  async processBatModel(databaseBat) {
    try {
      console.log(`\n🔍 Processing: ${databaseBat.brand} ${databaseBat.series} ${databaseBat.year}`);
      
      // Build search terms
      const searchTerms = this.buildSearchTerms(databaseBat);
      
      let bestResults = [];
      let bestSearchTerm = '';
      
      // Try each search term until we get good results
      for (const searchInfo of searchTerms) {
        console.log(`   🔎 Searching: "${searchInfo.term}"`);
        
        const searchResults = await this.scraper.searchBat(searchInfo.term);
        
        if (searchResults.length === 0) {
          console.log(`   ⚠️  No results for "${searchInfo.term}"`);
          continue;
        }
        
        // Score each result
        const scoredResults = searchResults.map(result => {
          const scoring = this.scoreSearchResult(result, databaseBat);
          return {
            ...result,
            score: scoring.score,
            reasons: scoring.reasons,
            isMatch: scoring.isMatch
          };
        });
        
        // Sort by score
        scoredResults.sort((a, b) => b.score - a.score);
        
        console.log(`   📊 Best result score: ${scoredResults[0]?.score || 0}`);
        
        // If we found a good match, use these results
        if (scoredResults[0]?.score >= 70) {
          bestResults = scoredResults;
          bestSearchTerm = searchInfo.term;
          break;
        }
        
        // Keep track of best results even if not great
        if (scoredResults[0]?.score > (bestResults[0]?.score || 0)) {
          bestResults = scoredResults;
          bestSearchTerm = searchInfo.term;
        }
        
        // Delay between searches
        await this.scraper.randomDelay(2000, 4000);
      }
      
      if (bestResults.length === 0) {
        console.log(`   ❌ No search results found`);
        this.results.skipped++;
        return;
      }
      
      const bestMatch = bestResults[0];
      console.log(`   🎯 Best match: "${bestMatch.title}" (Score: ${bestMatch.score})`);
      
      if (bestMatch.isMatch) {
        // Update existing bat prices
        const updates = await this.updateExistingBatPrices(databaseBat, bestResults);
        if (updates > 0) {
          this.results.pricesUpdated += updates;
        }
      } else {
        // This might be a new bat - add to pending
        const added = await this.addToPendingTables(bestMatch, bestSearchTerm, bestMatch.score);
        if (added) {
          this.results.newBatsFound++;
        }
      }
      
      this.results.processed++;
      
    } catch (error) {
      console.error(`❌ Error processing ${databaseBat.brand} ${databaseBat.series}:`, error.message);
      this.results.errors++;
    }
  }

  // =============================================
  // STEP 9: Main execution function
  // =============================================
  async run(limit = null) {
    try {
      await this.init();
      
      // Get all existing bats
      const existingBats = await this.getAllExistingBats();
      
      if (existingBats.length === 0) {
        console.log('⚠️  No existing bats found in database');
        return;
      }
      
      // Limit for testing
      const batsToProcess = limit ? existingBats.slice(0, limit) : existingBats;
      
      console.log(`\n🚀 Starting to process ${batsToProcess.length} bat models...`);
      console.log('='.repeat(50));
      
      // Process each bat
      for (let i = 0; i < batsToProcess.length; i++) {
        const bat = batsToProcess[i];
        
        console.log(`\n[${i + 1}/${batsToProcess.length}] Processing bat model...`);
        
        await this.processBatModel(bat);
        
        // Delay between bats to be respectful
        if (i < batsToProcess.length - 1) {
          console.log('   ⏱️  Waiting before next bat...');
          await this.scraper.randomDelay(3000, 6000);
        }
      }
      
      // Print final results
      this.printResults();
      
    } catch (error) {
      console.error('❌ Fatal error in run():', error.message);
    } finally {
      await this.scraper.close();
    }
  }

  // =============================================
  // STEP 10: Print final results
  // ============================================
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 DATABASE SCRAPER INTEGRATION COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 RESULTS SUMMARY:`);
    console.log(`   • Bat models processed: ${this.results.processed}`);
    console.log(`   • Prices updated: ${this.results.pricesUpdated}`);
    console.log(`   • New bats discovered: ${this.results.newBatsFound}`);
    console.log(`   • Errors encountered: ${this.results.errors}`);
    console.log(`   • Bats skipped: ${this.results.skipped}`);
    console.log('='.repeat(60));
    
    if (this.results.newBatsFound > 0) {
      console.log(`\n💡 TIP: Check the pending_bats table in Supabase to review ${this.results.newBatsFound} new bat discoveries!`);
    }
    
    if (this.results.pricesUpdated > 0) {
      console.log(`\n💰 TIP: ${this.results.pricesUpdated} prices were updated. Check the price_history view to see changes!`);
    }
  }
}

// =============================================
// TEST FUNCTION
// =============================================
async function testDatabaseIntegration() {
  const integration = new DatabaseScraperIntegration();
  
  console.log('🧪 TESTING Database Scraper Integration');
  console.log('Running with limit of 2 bats for testing...\n');
  
  try {
    await integration.run(2); // Test with just 2 bats
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export for use
module.exports = DatabaseScraperIntegration;

// Run test if executed directly
if (require.main === module) {
  testDatabaseIntegration();
}