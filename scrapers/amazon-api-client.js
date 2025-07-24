const crypto = require('crypto');
const https = require('https');

class AmazonApiClient {
  constructor() {
    this.accessKey = 'AKPAG54WZS1749665261';
    this.secretKey = 'JuXzLuP6PZOnokF0jSnH7ZcrsFb+zTQUDs/IpD3+';
    this.partnerTag = 'battracker-20';
    this.host = 'webservices.amazon.com';
    this.region = 'us-east-1';
    this.service = 'ProductAdvertisingAPI';
    this.marketplace = 'www.amazon.com';
    
    // Rate limiting - 5 second interval
    this.lastRequestTime = 0;
    this.minRequestInterval = 5000;
  }

  // Create canonical request for AWS Signature Version 4
  createCanonicalRequest(method, uri, queryString, headers, payload) {
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(key => `${key.toLowerCase()}:${headers[key]}`)
      .join('\n') + '\n';

    const signedHeaders = Object.keys(headers)
      .sort()
      .map(key => key.toLowerCase())
      .join(';');

    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

    return [
      method,
      uri,
      queryString,
      canonicalHeaders,
      signedHeaders,
      hashedPayload
    ].join('\n');
  }

  // Create string to sign
  createStringToSign(timestamp, credentialScope, canonicalRequest) {
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    
    return [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');
  }

  // Calculate signing key
  getSigningKey(dateStamp) {
    const kDate = crypto.createHmac('sha256', `AWS4${this.secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(this.service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  }

  // Sign the request
  signRequest(method, uri, payload, target) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);
    
    const headers = {
      'content-encoding': 'amz-1.0',
      'content-type': 'application/json; charset=utf-8',
      'host': this.host,
      'x-amz-date': amzDate,
      'x-amz-target': `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${target}`
    };

    const canonicalRequest = this.createCanonicalRequest(method, uri, '', headers, payload);
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = this.createStringToSign(amzDate, credentialScope, canonicalRequest);
    
    const signingKey = this.getSigningKey(dateStamp);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    
    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=${signature}`;
    
    headers['authorization'] = authorizationHeader;
    
    return headers;
  }

  // Rate limiting helper
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  // Make API request
  async makeRequest(target, payload) {
    await this.enforceRateLimit();
    
    const method = 'POST';
    let uri;
    if (target === 'SearchItems') {
      uri = '/paapi5/searchitems';
    } else if (target === 'GetItems') {
      uri = '/paapi5/getitems';
    } else if (target === 'GetVariations') {
      uri = '/paapi5/getvariations';
    } else {
      uri = '/paapi5/searchitems'; // fallback
    }
    const payloadString = JSON.stringify(payload);
    
    const headers = this.signRequest(method, uri, payloadString, target);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.host,
        path: uri,
        method: method,
        headers: headers
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode === 200) {
              console.log('🔍 DEBUG: Full API Response:', JSON.stringify(response, null, 2));
              resolve(response);
            } else {
              console.error(`Amazon API Error (${res.statusCode}):`, response);
              reject(new Error(`API Error: ${response.Errors?.[0]?.Message || 'Unknown error'}`));
            }
          } catch (error) {
            console.error('Failed to parse Amazon API response:', data);
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        console.error('Amazon API Request Error:', error);
        reject(error);
      });

      req.write(payloadString);
      req.end();
    });
  }

  // Search for products
  async searchItems(keywords, options = {}) {
    const payload = {
      Keywords: keywords,
      Resources: [
        'ItemInfo.Title',
        'Offers.Listings.Price'
      ],
      PartnerTag: this.partnerTag,
      PartnerType: 'Associates',
      Marketplace: this.marketplace,
      SearchIndex: 'All',
      ItemCount: options.itemCount || 10,
      ItemPage: options.itemPage || 1,
      SortBy: options.sortBy || 'Relevance'
    };

    // Add category filtering for baseball bats
    if (options.browseNodeId) {
      payload.BrowseNodeId = options.browseNodeId;
    }

    // Add brand filtering if specified
    if (options.brand) {
      payload.Brand = options.brand;
    }

    // Add price range if specified
    if (options.minPrice || options.maxPrice) {
      payload.Condition = 'New';
      if (options.minPrice) payload.MinPrice = options.minPrice * 100; // Convert to cents
      if (options.maxPrice) payload.MaxPrice = options.maxPrice * 100; // Convert to cents
    }

    try {
      console.log(`🔍 Amazon API: Searching for "${keywords}"`);
      const response = await this.makeRequest('SearchItems', payload);
      
      if (response.SearchResult && response.SearchResult.Items) {
        console.log(`✅ Found ${response.SearchResult.Items.length} products`);
        return response.SearchResult.Items;
      } else {
        console.log(`⚠️  No products found for "${keywords}"`);
        return [];
      }
    } catch (error) {
      console.error(`❌ Amazon API search failed for "${keywords}":`, error.message);
      return [];
    }
  }

  // Get detailed information for specific items
  async getItems(asins) {
    if (!Array.isArray(asins)) {
      asins = [asins];
    }

    const payload = {
      ItemIds: asins,
      Resources: [
        'ItemInfo.Title',
        'Offers.Listings.Price'
      ],
      PartnerTag: this.partnerTag,
      PartnerType: 'Associates',
      Marketplace: this.marketplace
    };

    try {
      console.log(`🔍 Amazon API: Getting details for ASINs: ${asins.join(', ')}`);
      const response = await this.makeRequest('GetItems', payload);
      
      if (response.ItemsResult && response.ItemsResult.Items) {
        console.log(`✅ Retrieved details for ${response.ItemsResult.Items.length} products`);
        return response.ItemsResult.Items;
      } else {
        console.log(`⚠️  No detailed data found for ASINs: ${asins.join(', ')}`);
        return [];
      }
    } catch (error) {
      console.error(`❌ Amazon API getItems failed for ASINs ${asins.join(', ')}:`, error.message);
      return [];
    }
  }

  // Get variations of a product with pagination support
async getVariations(asin) {
  let allVariations = [];
  let currentPage = 1;
  
  try {
    console.log(`🔍 Amazon API: Getting variations for ASIN: ${asin}`);
    
    while (true) {
      const payload = {
        ASIN: asin,
        Resources: [
          'ItemInfo.Title',
          'Offers.Listings.Price'
        ],
        PartnerTag: this.partnerTag,
        PartnerType: 'Associates',
        Marketplace: this.marketplace,
        ItemPage: currentPage
      };

      const response = await this.makeRequest('GetVariations', payload);
      
      if (response.VariationsResult && response.VariationsResult.Items) {
        console.log(`✅ Found ${response.VariationsResult.Items.length} variations on page ${currentPage}`);
        allVariations.push(...response.VariationsResult.Items);
        
        // Check if there are more pages
        const variationSummary = response.VariationsResult.VariationSummary;
        if (variationSummary && currentPage < variationSummary.PageCount) {
          currentPage++;
          // Add small delay between requests
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          break;
        }
      } else {
        console.log(`⚠️  No variations found for ASIN: ${asin} on page ${currentPage}`);
        break;
      }
    }
    
    // Deduplicate variations by ASIN
    const uniqueVariations = allVariations.filter((variation, index, self) => 
      index === self.findIndex(v => v.ASIN === variation.ASIN)
    );
    
    console.log(`✅ Total unique variations: ${uniqueVariations.length}`);
    return uniqueVariations;
    
  } catch (error) {
    console.error(`❌ Amazon API getVariations failed for ASIN ${asin}:`, error.message);
    return allVariations; // Return what we have so far
  }
}

  // Helper method to build baseball bat search terms
  buildBatSearchTerms(batModel) {
    const searchTerms = [];
    
    // Primary search: brand + series + year + certification
    searchTerms.push({
      keywords: `${batModel.brand} ${batModel.series} ${batModel.year} ${batModel.certification} baseball bat`,
      confidence: 100
    });
    
    // Secondary search: brand + series + certification (no year)
    searchTerms.push({
      keywords: `${batModel.brand} ${batModel.series} ${batModel.certification} baseball bat`,
      confidence: 85
    });
    
    // Tertiary search: just brand + series + bat
    searchTerms.push({
      keywords: `${batModel.brand} ${batModel.series} baseball bat`,
      confidence: 70
    });
    
    // Add brand-specific options
    const brandOptions = {
      brand: batModel.brand,
      browseNodeId: '3395451' // Baseball & Softball Equipment
    };
    
    return searchTerms.map(term => ({
      ...term,
      options: brandOptions
    }));
  }
}

module.exports = AmazonApiClient;