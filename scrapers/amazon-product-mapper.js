class AmazonProductMapper {
  constructor() {
    // Brand mapping for consistency
    this.brandMapping = {
      'louisville slugger': 'Louisville Slugger',
      'easton': 'Easton',
      'rawlings': 'Rawlings',
      'demarini': 'DeMarini',
      'marucci': 'Marucci',
      'victus': 'Victus',
      'combat': 'Combat',
      'wilson': 'Wilson'
    };

    // Certification patterns
    this.certificationPatterns = {
      'bbcor': 'BBCOR',
      'usssa': 'USSSA',
      'usa baseball': 'USA Baseball',
      'usab': 'USA Baseball'
    };
  }

  // Extract bat information from Amazon product
  extractBatInfo(amazonProduct) {
    try {
      const title = amazonProduct.ItemInfo?.Title?.DisplayValue || '';
      const features = amazonProduct.ItemInfo?.Features?.DisplayValues || [];
      const techInfo = amazonProduct.ItemInfo?.TechnicalInfo || {};
      
      console.log(`📋 Extracting bat info from: "${title.substring(0, 80)}..."`);

      const batInfo = {
        // Basic identification
        asin: amazonProduct.ASIN,
        title: title,
        brand: this.extractBrand(title, features),
        series: this.extractSeries(title),
        year: this.extractYear(title, features),
        certification: this.extractCertification(title, features),
        
        // Technical specifications
        material: this.extractMaterial(title, features),
        construction: this.extractConstruction(title, features),
        barrelSize: this.extractBarrelSize(title, features),
        
        // Pricing and availability
        price: this.extractPrice(amazonProduct),
        availability: this.extractAvailability(amazonProduct),
        inStock: this.extractStockStatus(amazonProduct),
        
        // Additional data
        images: this.extractImages(amazonProduct),
        rating: this.extractRating(amazonProduct),
        reviewCount: this.extractReviewCount(amazonProduct),
        salesRank: this.extractSalesRank(amazonProduct),
        
        // Variants and size information
        variants: this.extractVariants(amazonProduct, title, features),
        
        // URLs and affiliate links
        url: `https://www.amazon.com/dp/${amazonProduct.ASIN}?tag=battracker-20`,
        affiliateUrl: this.buildAffiliateUrl(amazonProduct.ASIN),
        
        // Confidence scoring
        relevanceScore: this.calculateRelevanceScore(title, features),
        
        // Raw data for debugging
        rawFeatures: features,
        rawTechInfo: techInfo
      };

      console.log(`   ✅ Extracted: ${batInfo.brand} ${batInfo.series} ${batInfo.year} ${batInfo.certification}`);
      console.log(`   💰 Price: $${batInfo.price} | ⭐ ${batInfo.rating}/5 (${batInfo.reviewCount} reviews)`);
      
      return batInfo;
    } catch (error) {
      console.error(`❌ Error extracting bat info:`, error.message);
      return null;
    }
  }

  // Extract brand from title and features
  extractBrand(title, features) {
    const text = `${title} ${features.join(' ')}`.toLowerCase();
    
    for (const [key, value] of Object.entries(this.brandMapping)) {
      if (text.includes(key)) {
        return value;
      }
    }
    
    // Fallback: try to extract first word if it looks like a brand
    const words = title.split(' ');
    const firstWord = words[0]?.toLowerCase();
    if (firstWord && firstWord.length > 3) {
      return words[0];
    }
    
    return 'Unknown';
  }

  // Extract series/model from title
  extractSeries(title) {
    // Common bat series patterns
    const seriesPatterns = [
      /\b(Atlas|Meta|Ghost|Velo|CAT|Beast|Select|Omaha|Prime|Big Barrel|PowerDrive|5150|Threat|Dude Perfect)\b/i,
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:BBCOR|USSSA|USA)/i
    ];
    
    for (const pattern of seriesPatterns) {
      const match = title.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    // Fallback: try to extract meaningful words between brand and certification
    const words = title.split(' ');
    for (let i = 1; i < words.length - 2; i++) {
      const word = words[i];
      if (word.length > 3 && !word.match(/^\d+$/) && !word.match(/^(baseball|bat|inch|oz)$/i)) {
        return word;
      }
    }
    
    return 'Unknown';
  }

  // Extract year from title and features
  extractYear(title, features) {
    const text = `${title} ${features.join(' ')}`;
    const yearMatch = text.match(/20(2[0-9]|3[0-9])/);
    
    if (yearMatch) {
      return parseInt(yearMatch[0]);
    }
    
    // Default to current year if not found
    return new Date().getFullYear();
  }

  // Extract certification from title and features
  extractCertification(title, features) {
    const text = `${title} ${features.join(' ')}`.toLowerCase();
    
    for (const [pattern, certification] of Object.entries(this.certificationPatterns)) {
      if (text.includes(pattern)) {
        return certification;
      }
    }
    
    // Default based on common patterns
    if (text.includes('(-3)') || text.includes('drop 3')) {
      return 'BBCOR';
    }
    
    return 'BBCOR'; // Most common default
  }

  // Extract material information
  extractMaterial(title, features) {
    const text = `${title} ${features.join(' ')}`.toLowerCase();
    
    if (text.includes('composite')) return 'Composite';
    if (text.includes('alloy') || text.includes('aluminum')) return 'Alloy';
    if (text.includes('hybrid')) return 'Hybrid';
    if (text.includes('wood')) return 'Wood';
    
    return 'Alloy'; // Most common default
  }

  // Extract construction type
  extractConstruction(title, features) {
    const text = `${title} ${features.join(' ')}`.toLowerCase();
    
    if (text.includes('two piece') || text.includes('2-piece')) return '2-Piece';
    if (text.includes('one piece') || text.includes('1-piece')) return '1-Piece';
    if (text.includes('three piece') || text.includes('3-piece')) return '3-Piece';
    
    return '1-Piece'; // Most common default
  }

  // Extract barrel size
  extractBarrelSize(title, features) {
    const text = `${title} ${features.join(' ')}`;
    const barrelMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:inch|")\s*barrel/i);
    
    if (barrelMatch) {
      return parseFloat(barrelMatch[1]) + '"';
    }
    
    // BBCOR standard
    return '2 5/8"';
  }

  // Extract price information
  extractPrice(amazonProduct) {
    try {
      // Try main offer price first
      const mainOffer = amazonProduct.Offers?.Listings?.[0]?.Price;
      if (mainOffer?.Amount) {
        return mainOffer.Amount; // dollars
      }
      
      // Try offer summaries
      const lowestPrice = amazonProduct.Offers?.Summaries?.[0]?.LowestPrice;
      if (lowestPrice?.Amount) {
        return lowestPrice.Amount;
      }
      
      // Try variation pricing
      const variationPrice = amazonProduct.VariationSummary?.Price?.LowestPrice;
      if (variationPrice?.Amount) {
        return variationPrice.Amount;
      }
      
      return null;
    } catch (error) {
      console.log(`   ⚠️ Could not extract price: ${error.message}`);
      return null;
    }
  }

  // Extract availability information
  extractAvailability(amazonProduct) {
    try {
      const availability = amazonProduct.Offers?.Listings?.[0]?.Availability;
      return availability?.Message || 'Unknown';
    } catch (error) {
      return 'Unknown';
    }
  }

  // Extract stock status
  extractStockStatus(amazonProduct) {
    try {
      const availability = amazonProduct.Offers?.Listings?.[0]?.Availability;
      if (!availability) return false;
      
      const message = availability.Message?.toLowerCase() || '';
      const type = availability.Type?.toLowerCase() || '';
      
      // Check for in-stock indicators
      return !message.includes('out of stock') && 
             !message.includes('unavailable') && 
             !message.includes('discontinued') &&
             type !== 'outofstock';
    } catch (error) {
      return false;
    }
  }

  // Extract product images
  extractImages(amazonProduct) {
    const images = {
      primary: null,
      variants: []
    };
    
    try {
      // Primary image
      if (amazonProduct.Images?.Primary?.Large?.URL) {
        images.primary = amazonProduct.Images.Primary.Large.URL;
      } else if (amazonProduct.Images?.Primary?.Medium?.URL) {
        images.primary = amazonProduct.Images.Primary.Medium.URL;
      }
      
      // Variant images
      if (amazonProduct.Images?.Variants) {
        images.variants = amazonProduct.Images.Variants
          .filter(variant => variant.Large?.URL)
          .map(variant => variant.Large.URL);
      }
      
      return images;
    } catch (error) {
      console.log(`   ⚠️ Could not extract images: ${error.message}`);
      return images;
    }
  }

  // Extract customer rating
  extractRating(amazonProduct) {
    try {
      const rating = amazonProduct.CustomerReviews?.StarRating?.Value;
      return rating ? parseFloat(rating) : null;
    } catch (error) {
      return null;
    }
  }

  // Extract review count
  extractReviewCount(amazonProduct) {
    try {
      return amazonProduct.CustomerReviews?.Count || 0;
    } catch (error) {
      return 0;
    }
  }

  // Extract sales rank
  extractSalesRank(amazonProduct) {
    try {
      return amazonProduct.BrowseNodeInfo?.WebsiteSalesRank?.SalesRank || null;
    } catch (error) {
      return null;
    }
  }

  // Extract size variants from product info 
extractVariants(amazonProduct, title, features) {   
  const variants = [];      
  
  try {     
    console.log(`🔍 Extracting variants for ASIN: ${amazonProduct.ASIN}`);     
    // console.log(`🐛 DEBUG: Full Amazon product object for ${amazonProduct.ASIN}:`);     
    // console.log(JSON.stringify(amazonProduct, null, 2));          
    
    // PRIORITY 1: Handle VariationAttributes from GetVariations response     
    if (amazonProduct.VariationAttributes) {       
      // console.log(`   📏 Found VariationAttributes`);       
      // console.log(JSON.stringify(amazonProduct.VariationAttributes, null, 2));       
      
      let length = null;       
      let drop = null;       
      
      // Extract drop - BBCOR logic
      if (!drop) {
        // First try to find explicit drop in title
        const titleDropMatch = title.match(/-(\d+)/);
        if (titleDropMatch) {
          drop = '-' + titleDropMatch[1];
          console.log(`   🎯 Drop found in title: ${drop}`);
        } else {
          // For BBCOR bats, assume -3 if no explicit drop found
          const certification = this.extractCertification(title, features);
          if (certification === 'BBCOR') {
            drop = '-3';
            console.log(`   🎯 BBCOR bat detected, assuming drop: ${drop}`);
          }
        }
      }
      
      // Look for bat_drop_ratio first (USSSA bats)
      const dropAttr = amazonProduct.VariationAttributes.find(attr => 
        attr.Name === 'bat_drop_ratio'
      );
      
      if (dropAttr && dropAttr.Value) {
        drop = dropAttr.Value;
        console.log(`   🎯 Drop found: ${drop}`);
      }
      
      // Look for length
const lengthAttr = amazonProduct.VariationAttributes.find(attr => 
  attr.Name === 'item_length_numeric'
);

if (lengthAttr && lengthAttr.Value) {
  const lengthMatch = lengthAttr.Value.match(/(\d+(?:\.\d+)?)/);
  if (lengthMatch) {
    length = parseFloat(lengthMatch[1]);
    console.log(`   🎯 Length found: ${length}"`);
  }
}

// Look for size_name attribute (common format)
if (!length) {
  const sizeAttr = amazonProduct.VariationAttributes.find(attr => 
    attr.Name === 'size_name'
  );
  
  if (sizeAttr && sizeAttr.Value) {
    const sizeMatch = sizeAttr.Value.match(/(\d+)\s*inch/i);
    if (sizeMatch) {
      length = parseInt(sizeMatch[1]);
      console.log(`   🎯 Length found from size_name: ${length}"`);
    }
  }
}

// If we have both length and drop, calculate weight
if (length && drop) {
  const dropNum = parseInt(drop);
  const weight = length - Math.abs(dropNum);
        
        // Validate reasonable bat dimensions
        if (length >= 24 && length <= 36 && weight >= 15 && weight <= 35) {
          variants.push({
            length: length + '"',
            weight: weight + ' oz',
            drop: drop,
            asin: amazonProduct.ASIN,
            source: 'variation_attributes'
          });
          
          console.log(`   ✅ Parsed variant: ${length}" / ${weight}oz / ${drop}`);
          return variants;
        }
      }
      
      // Fallback: Look for size_name (older format) - PROCESS BEFORE TITLE
      const sizeAttr = amazonProduct.VariationAttributes.find(attr => 
        attr.Name === 'size_name'
      );
      
      if (sizeAttr && sizeAttr.Value) {
        console.log(`   🎯 Size attribute found: ${sizeAttr.Value}`);
        
        // Try multiple patterns
        const patterns = [
          /(\d+(?:\.\d+)?)["']\s*[\/\-]?\s*(\d+(?:\.\d+)?)\s*oz/i,  // 30"/27 oz
          /(\d+)"\s*(\d+)\s*oz/i,                                  // 28" 18 OZ
          /(\d+)"\s*\(\-(\d+)\)/i,                                 // 31" (-8)
          /(\d+)'\s*\|\s*\-(\d+)/i,                                 // 33' | -3
          /(\d+)\-inch\s*\|\s*\-(\d+)/i,                            // 33-inch | -3
          /(\d+)'\s*barrel\s*\|\s*(\d+)'\s*\|\s*\-(\d+)/i,         // 2 5/8' Barrel | 33' | -3
          /(\d+(?:\.\d+)?)\s*inch/i,                                // 31 Inch
          /(\d+(?:\.\d+)?)in\s*[\/\-]\s*(\d+(?:\.\d+)?)oz/i,      // 32in/29oz  
          /(\d+(?:\.\d+)?)\s*[\/\-]\s*(\d+(?:\.\d+)?)\s*\|/i       // 34/31 |
        ];

        for (const pattern of patterns) {
          const match = sizeAttr.Value.match(pattern);
          if (match) {
            const length = parseFloat(match[1]);
            let weight, drop;
            
            // Handle parentheses drop pattern: 31" (-8)
            if (pattern.source.includes('\\(\\-')) {
              const dropNum = parseInt(match[2]);
              weight = length - dropNum;
              drop = `-${dropNum}`;
            } 
            // Handle pipe drop patterns: 33' | -3 or 33-inch | -3
            else if (pattern.source.includes('\\|\\s*\\-')) {
              const dropNum = parseInt(match[2]);
              weight = length - dropNum;
              drop = `-${dropNum}`;
            }
            // Handle barrel pattern: 2 5/8' Barrel | 33' | -3
            else if (pattern.source.includes('barrel')) {
              const dropNum = parseInt(match[3]);
              weight = length - dropNum;
              drop = `-${dropNum}`;
            }
            // Default weight calculation for patterns with explicit weight
            else {
              weight = match[2] ? parseFloat(match[2]) : length - 10; // Default to USSSA -10
              drop = -(length - weight);
            }
            
            // Validate reasonable dimensions
            if (length >= 24 && length <= 36 && weight >= 15 && weight <= 35) {
              variants.push({
                length: length + '"',
                weight: weight + ' oz',
                drop: drop.toString(),
                asin: amazonProduct.ASIN,
                source: 'variation_attributes'
              });
              
              console.log(`   ✅ Parsed variant: ${length}" / ${weight}oz / ${drop}`);
              return variants;
            }
          }
        }
      }
    }
    
    // PRIORITY 2: Extract from title - FIXED LOGIC
    const titleText = title.toLowerCase();
    let explicitDrop = null;
    
    // Look for explicit drop in title
    const dropPatterns = [
      /\-(\d+)\s+usssa/i,           // "-8 USSSA"
      /\-(\d+)\s+youth/i,           // "-8 Youth"
      /usssa.*\-(\d+)/i,            // "USSSA ... -8"
      /\|\s*\-(\d+)\s*\|/i,         // "| -8 |"
      /\-(\d+)\s*\|\s*2/i           // "-8 | 2 3/4"
    ];
    
    for (const pattern of dropPatterns) {
      const dropMatch = titleText.match(pattern);
      if (dropMatch) {
        explicitDrop = '-' + dropMatch[1];
        console.log(`   🎯 Found explicit drop in title: ${explicitDrop}`);
        break;
      }
    }
    
    // Extract length from title
    const lengthMatch = title.match(/(\d+)\s*inch/i);
    if (lengthMatch && explicitDrop) {
      const length = parseInt(lengthMatch[1]);
      const dropNum = Math.abs(parseInt(explicitDrop));
      const weight = length - dropNum;
      
      }
    
    // No size info found - return empty variants array
    console.log(`   ⚠️ No size info found, skipping variant creation`);
    return variants;
    
  } catch (error) {
    console.log(`   ❌ Error extracting variants: ${error.message}`);
    return [];
  }
}

// Enhanced parsing for better BBCOR detection
parseVariantText(variantText) {
  const text = variantText.toLowerCase().replace(/[^\w\s\.\-\/]/g, ' ');
  console.log(`   🔍 Parsing variant text: "${variantText}"`);
  
  // Pattern 1: "32 inch" or "32in" (length only)
  const lengthOnlyMatch = text.match(/(\d+)(?:\s*(?:inch|in|"))/);
  if (lengthOnlyMatch) {
    const length = parseInt(lengthOnlyMatch[1]);
    
    // Validate BBCOR range
    if (length >= 29 && length <= 34) {
      return {
        length: length + '"',
        weight: (length - 3) + ' oz', // BBCOR standard
        drop: '-3'
      };
    }
  }
  
  // Pattern 2: "32 inch / 29 oz" or "32in/29oz"
  const fullMatch = text.match(/(\d+)(?:\s*(?:inch|in|"))\s*[\/-]?\s*(\d+(?:\.\d+)?)\s*oz/);
  if (fullMatch) {
    const length = parseInt(fullMatch[1]);
    const weight = parseFloat(fullMatch[2]);
    const drop = -(length - weight);
    
    return {
      length: length + '"',
      weight: weight + ' oz',
      drop: drop.toString()
    };
  }
  
  // Pattern 3: Just numbers "32/29" (assuming length/weight)
  const numberMatch = text.match(/(\d+)\s*[\/-]\s*(\d+(?:\.\d+)?)/);
  if (numberMatch) {
    const num1 = parseInt(numberMatch[1]);
    const num2 = parseFloat(numberMatch[2]);
    
    // If first number is in BBCOR range, assume it's length
    if (num1 >= 29 && num1 <= 34 && num2 >= 20 && num2 <= 35) {
      const drop = -(num1 - num2);
      return {
        length: num1 + '"',
        weight: num2 + ' oz',
        drop: drop.toString()
      };
    }
  }
  
  console.log(`   ⚠️ Could not parse variant text: "${variantText}"`);
  return { length: null, weight: null, drop: null };
}

// Updated default length extraction for BBCOR
extractDefaultLength(title) {
  // Look for length in title first
  const lengthMatch = title.match(/(\d+)(?:\s*(?:inch|in|"))/i);
  if (lengthMatch) {
    const length = parseInt(lengthMatch[1]);
    
    // Validate BBCOR range
    if (length >= 29 && length <= 34) {
      return length;
    }
  }
  
  // Default to most common BBCOR size
  return 32;
}

// Extract colorway from Amazon product data
extractColorway(amazonProduct) {
 try {
   const title = amazonProduct.ItemInfo?.Title?.DisplayValue || '';
   
   // Step 1: Check for special product name variations first
   const specialVariations = [
     'pool party', 'fire ice', 'blackout', 'whiteout', 
     'stealth', 'glow', 'electric', 'neon', 'ghost',
     'platinum', 'gold', 'silver', 'cosmic', 'galaxy',
     'vapor', 'phantom', 'carbon', 'chrome', 'flame',
     'ice', 'storm', 'thunder', 'lightning', 'sunset'
   ];
   
   for (const variation of specialVariations) {
     if (title.toLowerCase().includes(variation)) {
       return variation;
     }
   }
   
   // Step 2: Map complex colorway patterns to standard
   const complexColorwayPatterns = [
     /white\s*\|\s*snow\s*camo/i,
     /black\s*\|\s*silver/i,
     /red\s*\|\s*white/i,
     /blue\s*\|\s*white/i,
     /navy\s*\|\s*gold/i,
     /gray\s*\|\s*black/i,
     /grey\s*\|\s*black/i,
     /orange\s*\|\s*black/i,
     /green\s*\|\s*white/i,
     /yellow\s*\|\s*black/i,
     /purple\s*\|\s*white/i,
     /maroon\s*\|\s*white/i,
     /royal\s*\|\s*white/i,
     /scarlet\s*\|\s*gray/i,
     /carbon\s*\|\s*red/i,
     /matte\s*\|\s*\w+/i,
     /glossy\s*\|\s*\w+/i,
     /\w+\s*\|\s*camo/i,
     /\w+\s*\|\s*fade/i,
     /\w+\s*\|\s*burst/i
   ];
   
   for (const pattern of complexColorwayPatterns) {
     if (title.toLowerCase().match(pattern)) {
       return 'standard';
     }
   }
   
   // Step 3: Check VariationAttributes for color_name
   if (amazonProduct.VariationAttributes) {
     const colorAttr = amazonProduct.VariationAttributes.find(attr => 
       attr.Name === 'color_name'
     );
     if (colorAttr && colorAttr.Value) {
       const colorValue = colorAttr.Value.trim();
       
       // Step 4: Map basic/standard colors to "standard"
       const standardColors = [
         'Orange', 'Black', 'White', 'Red', 'Blue', 'Green', 
         'Yellow', 'Gray', 'Grey', 'Silver', 'Natural',
         'Standard', 'Default', 'Primary', 'Navy', 'Royal',
         'Maroon', 'Purple', 'Gold', 'Brown', 'Pink'
       ];
       
       // If it's a basic color, treat as standard
       if (standardColors.includes(colorValue)) {
         return 'standard';
       }
       
       // Otherwise return the specific colorway (lowercase for consistency)
       return colorValue.toLowerCase();
     }
   }
   
   // Step 5: Default fallback
   return 'standard';
   
 } catch (error) {
   console.log(`   ⚠️ Error extracting colorway: ${error.message}`);
   return 'standard';
 }
}

  // Calculate relevance score for matching against database bats
  calculateRelevanceScore(title, features) {
    let score = 0;
    const text = `${title} ${features.join(' ')}`.toLowerCase();
    
    // Check for baseball bat indicators
    if (text.includes('baseball bat')) score += 20;
    if (text.includes('bbcor') || text.includes('usssa') || text.includes('usa baseball')) score += 15;
    if (text.includes('composite') || text.includes('alloy')) score += 10;
    if (text.includes('drop') || text.includes('(-')) score += 10;
    
    // Check for brand indicators
    for (const brand of Object.keys(this.brandMapping)) {
      if (text.includes(brand)) {
        score += 25;
        break;
      }
    }
    
    // Length and quality indicators
    if (title.length > 20 && title.length < 150) score += 10;
    if (features.length > 2) score += 5;
    
    return Math.min(score, 100);
  }

  // Build proper affiliate URL with tracking
  buildAffiliateUrl(asin, trackingId = 'battracker-20') {
    return `https://www.amazon.com/dp/${asin}?tag=${trackingId}&linkCode=ogi&th=1&psc=1`;
  }

  // Score product match against database bat model
  scoreProductMatch(amazonProduct, databaseBat) {
    const batInfo = this.extractBatInfo(amazonProduct);
    if (!batInfo) return { score: 0, reasons: ['Failed to extract bat info'] };
    
    let score = 0;
    const reasons = [];
    
    // Brand matching (critical)
    if (batInfo.brand.toLowerCase() === databaseBat.brand.toLowerCase()) {
      score += 30;
      reasons.push(`Brand match: ${batInfo.brand}`);
    }
    
    // Series matching (critical)
    if (batInfo.series && batInfo.series.toLowerCase().includes(databaseBat.series.toLowerCase())) {
      score += 30;
      reasons.push(`Series match: ${batInfo.series}`);
    }
    
    // Year matching (important)
    if (batInfo.year === databaseBat.year) {
      score += 20;
      reasons.push(`Year match: ${batInfo.year}`);
    } else if (Math.abs(batInfo.year - databaseBat.year) <= 1) {
      score += 10;
      reasons.push(`Year close: ${batInfo.year} vs ${databaseBat.year}`);
    }
    
    // Certification matching (important)
    if (batInfo.certification === databaseBat.certification) {
      score += 15;
      reasons.push(`Certification match: ${batInfo.certification}`);
    }
    
    // Material matching
    if (batInfo.material === databaseBat.material) {
      score += 5;
      reasons.push(`Material match: ${batInfo.material}`);
    }
    
    // Baseball bat confirmation
    if (batInfo.title.toLowerCase().includes('baseball bat')) {
      score += 5;
      reasons.push('Confirmed baseball bat');
    }
    
    // Relevance score bonus
    if (batInfo.relevanceScore >= 80) {
      score += 5;
      reasons.push('High relevance score');
    }
    
    return {
      score,
      reasons,
      isMatch: score >= 70, // Threshold for considering it a match
      batInfo
    };
  }

  // Transform Amazon product to database format
  transformToDatabase(amazonProduct, matchingBatModel = null) {
    const batInfo = this.extractBatInfo(amazonProduct);
    if (!batInfo) return null;
    
    return {
      // Product identification
      amazon_asin: batInfo.asin,
      title: batInfo.title,
      brand: batInfo.brand,
      series: batInfo.series,
      year: batInfo.year,
      certification: batInfo.certification,
      
      // Technical specs
      material: batInfo.material,
      construction: batInfo.construction,
      barrel_size: batInfo.barrelSize,
      
      // Pricing and availability
      price: batInfo.price,
      in_stock: batInfo.inStock,
      availability_message: batInfo.availability,
      
      // Additional data
      image_url: batInfo.images.primary,
      rating: batInfo.rating,
      review_count: batInfo.reviewCount,
      sales_rank: batInfo.salesRank,
      
      // Variants
      variants: batInfo.variants,
      
      // URLs
      product_url: batInfo.url,
      
      // Metadata
      relevance_score: batInfo.relevanceScore,
      last_updated: new Date().toISOString(),
      
      // Source tracking
      source: 'amazon_api',
      raw_data: {
        features: batInfo.rawFeatures,
        tech_info: batInfo.rawTechInfo
      }
    };
  }
}

module.exports = AmazonProductMapper;