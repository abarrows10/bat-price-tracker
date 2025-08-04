import React, { useState, useMemo } from 'react';
import { Search, Filter, TrendingUp, ExternalLink, Star, ChevronDown } from 'lucide-react';
import { useBats } from './useBats';

const BatPriceTracker = () => {
  // Get real data from database
  const { bats, loading, error } = useBats();

  // State for filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCertifications, setSelectedCertifications] = useState(['BBCOR']);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [selectedConstructions, setSelectedConstructions] = useState([]);
  const [selectedDrops, setSelectedDrops] = useState([]);
  const [selectedSwingWeights, setSelectedSwingWeights] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);
  const [priceRange, setPriceRange] = useState([0, 600]);
  const [sortBy, setSortBy] = useState('year-price-high');
  const [selectedImage, setSelectedImage] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Selected variant for each bat (default to smallest size with price)
const [selectedVariants, setSelectedVariants] = useState(() => {
  const defaults = {};
  bats.forEach(bat => {
    if (bat.variants && bat.variants.length > 0) {
      // Find variants that have a price
      const variantsWithPrices = bat.variants.filter(variant => {
        return variant.price && (
          (variant.price.amazon && variant.price.amazon > 0) ||
          (variant.price.dicks && variant.price.dicks > 0) ||
          (variant.price.justbats && variant.price.justbats > 0)
        );
      });
      
      if (variantsWithPrices.length > 0) {
        // Sort by length (ascending) to get smallest size
        const sortedVariants = variantsWithPrices.sort((a, b) => {
          const aLength = parseInt(a.length.replace('"', ''));
          const bLength = parseInt(b.length.replace('"', ''));
          return aLength - bLength;
        });
        defaults[bat.id] = sortedVariants[0];
      } else {
        // Fallback to first variant if none have prices
        defaults[bat.id] = bat.variants[0];
      }
    }
  });
  return defaults;
});

  // Update selectedVariants when bats data changes
useMemo(() => {
  if (bats.length > 0) {
    const defaults = {};
    bats.forEach(bat => {
      if (!selectedVariants[bat.id]) {
        if (bat.variants && bat.variants.length > 0) {
          // Find variants that have a price
          const variantsWithPrices = bat.variants.filter(variant => {
            return variant.price && (
              (variant.price.amazon && variant.price.amazon > 0) ||
              (variant.price.dicks && variant.price.dicks > 0) ||
              (variant.price.justbats && variant.price.justbats > 0)
            );
          });
          
          if (variantsWithPrices.length > 0) {
            // Sort by length (ascending) to get smallest size
            const sortedVariants = variantsWithPrices.sort((a, b) => {
              const aLength = parseInt(a.length.replace('"', ''));
              const bLength = parseInt(b.length.replace('"', ''));
              return aLength - bLength;
            });
            defaults[bat.id] = sortedVariants[0];
          } else {
            // Fallback to first variant if none have prices
            defaults[bat.id] = bat.variants[0];
          }
        }
      }
    });
    setSelectedVariants(prev => ({ ...prev, ...defaults }));
  }
}, [bats, selectedVariants]);

  // Get unique filter values dynamically from current data
  const availableFilters = useMemo(() => {
    // Filter bats first by current search and certification
    let currentBats = bats.filter(bat => {
      const matchesSearch = bat.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           bat.series?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCertification = selectedCertifications.length === 0 || selectedCertifications.includes(bat.certification);
      return matchesSearch && matchesCertification;
    });

    // Extract unique values from filtered bats
    const brands = [...new Set(currentBats.map(bat => bat.brand).filter(Boolean))].sort();
    const materials = [...new Set(currentBats.map(bat => bat.material).filter(Boolean))].sort();
    const constructions = [...new Set(currentBats.map(bat => bat.construction).filter(Boolean))].sort();
    
    // Get drops based on selected certifications and current bats
    const drops = new Set();
    currentBats.forEach(bat => {
      if (selectedCertifications.includes(bat.certification) && bat.variants) {
        bat.variants.forEach(variant => {
          if (variant.drop) drops.add(variant.drop);
        });
      }
    });

    // Get swing weights
    const swingWeights = new Set();
    currentBats.forEach(bat => {
      if (bat.swingWeight) {
        swingWeights.add(bat.swingWeight);
      }
    });

    // Get years
    const years = [...new Set(currentBats.map(bat => bat.year).filter(Boolean))].sort((a, b) => b - a);

    return {
      brands,
      materials, 
      constructions,
      drops: Array.from(drops).sort(),
      swingWeights: Array.from(swingWeights).sort(),
      years
    };
  }, [bats, searchTerm, selectedCertifications]);

  const certifications = ['BBCOR', 'USSSA', 'USA Baseball'];

  // Filter bats based on current filters - WITH LOCKED SORTING
  const filteredBats = useMemo(() => {
    let filtered = bats.filter(bat => {
      const matchesSearch = bat.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           bat.series?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCertification = selectedCertifications.length === 0 || selectedCertifications.includes(bat.certification);
      const matchesBrand = selectedBrands.length === 0 || selectedBrands.includes(bat.brand);
      const matchesMaterial = selectedMaterials.length === 0 || selectedMaterials.includes(bat.material);
      const matchesConstruction = selectedConstructions.length === 0 || selectedConstructions.includes(bat.construction);
      
      // Check if bat has any variants with selected drops
      const matchesDrop = selectedDrops.length === 0 || 
                         (bat.variants && bat.variants.some(variant => selectedDrops.includes(variant.drop)));
      
      const matchesSwingWeight = selectedSwingWeights.length === 0 || selectedSwingWeights.includes(bat.swingWeight);
      const matchesYear = selectedYears.length === 0 || selectedYears.includes(bat.year);

      // Check price range against lowest available price (not selected variant)
      let lowestPrice = 999999;
      if (bat.variants && bat.variants.length > 0) {
        bat.variants.forEach(variant => {
          if (variant.price) {
            const prices = [variant.price?.amazon, variant.price?.dicks, variant.price?.justbats].filter(p => p && p > 0);
            if (prices.length > 0) {
              lowestPrice = Math.min(lowestPrice, Math.min(...prices));
            }
          }
        });
      }
      if (lowestPrice === 999999) lowestPrice = 0;
      const matchesPrice = lowestPrice >= priceRange[0] && lowestPrice <= priceRange[1];
      
      return matchesSearch && matchesCertification && matchesBrand && matchesMaterial && 
       matchesConstruction && matchesDrop && matchesSwingWeight && matchesYear && matchesPrice;
    });

    // Sort results - using base bat data for consistent ordering
    filtered.sort((a, b) => {
      // Get lowest price for each bat across all variants (for consistent sorting)
      const getLowestPrice = (bat) => {
        let lowest = 999999;
        if (bat.variants && bat.variants.length > 0) {
          bat.variants.forEach(variant => {
            if (variant.price) {
              const prices = [variant.price?.amazon, variant.price?.dicks, variant.price?.justbats].filter(p => p && p > 0);
              if (prices.length > 0) {
                lowest = Math.min(lowest, Math.min(...prices));
              }
            }
          });
        }
        return lowest === 999999 ? 0 : lowest;
      };

      if (sortBy === 'year-price-high') {
        // First by year (newest first)
          const yearDiff = (b.year || 0) - (a.year || 0);
          if (yearDiff !== 0) return yearDiff;
          
          // Then by price (high to low)
          const aPriceHigh = getLowestPrice(a);
          const bPriceHigh = getLowestPrice(b);
          return bPriceHigh - aPriceHigh;
      }
      
      switch (sortBy) {
        case 'price-low':
          const aPriceLow = getLowestPrice(a);
          const bPriceLow = getLowestPrice(b);
          return aPriceLow - bPriceLow;
        case 'price-high':
          const aPriceHigh = getLowestPrice(a);
          const bPriceHigh = getLowestPrice(b);
          return bPriceHigh - aPriceHigh;
        case 'name':
          return (a.series || '').localeCompare(b.series || '');
        default:
          return 0;
      }
    });

    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bats, searchTerm, selectedCertifications, selectedBrands, selectedMaterials, 
      selectedConstructions, selectedDrops, selectedSwingWeights, selectedYears, priceRange, sortBy]);

// ===== SPLIT POINT - PART 2 STARTS HERE =====
// This continues from Part 1 - place this code immediately after the Part 1 code

  // Handle multi-select for filters
  const toggleFilter = (filterArray, setFilter, value) => {
    if (filterArray.includes(value)) {
      setFilter(filterArray.filter(item => item !== value));
    } else {
      setFilter([...filterArray, value]);
    }
  };

  // Handle variant selection
  const selectVariant = (batId, variant) => {
  const currentScrollY = window.scrollY;
  setSelectedVariants(prev => ({
    ...prev,
    [batId]: variant
  }));
  // Prevent scroll jump
  requestAnimationFrame(() => {
    window.scrollTo(0, currentScrollY);
  });
};

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedCertifications(['BBCOR']);
    setSelectedBrands([]);
    setSelectedMaterials([]);
    setSelectedConstructions([]);
    setSelectedDrops([]);
    setSelectedSwingWeights([]);
    setSelectedYears([]);
    setPriceRange([0, 600]);
  };

  const BatCard = ({ bat }) => {
  const selectedVariant = selectedVariants[bat.id];
  console.log('BatCard selectedVariant:', selectedVariant);
  console.log('Raw bat variants:', bat.variants);

  // For USSSA bats, we need to manage drop selection separately
  const [selectedDrop, setSelectedDrop] = useState(selectedVariant?.drop || '-10');
  
  if (!selectedVariant || !bat.variants) return null;
  
  const availableLengths = [...new Set(bat.variants.map(v => v.length))].sort();
  const availableDropsForBat = [...new Set(bat.variants.map(v => v.drop))].sort((a, b) => {
    // Custom sort for USSSA drops: -10, -8, -5
    const dropOrder = {'-10': 1, '-8': 2, '-5': 3};
    return (dropOrder[a] || 999) - (dropOrder[b] || 999);
  });
  
  // Get available lengths for the selected drop
  const availableLengthsForDrop = bat.certification === 'USSSA' 
    ? [...new Set(bat.variants.filter(v => v.drop === selectedDrop).map(v => v.length))].sort()
    : availableLengths;
  
  const lowestPrice = Math.min(
    selectedVariant.price?.amazon || 999, 
    selectedVariant.price?.dicks || 999, 
    selectedVariant.price?.justbats || 999
  );
  const bestRetailer = selectedVariant.price?.amazon === lowestPrice ? 'amazon' :
                      selectedVariant.price?.dicks === lowestPrice ? 'dicks' : 'justbats';
  
  return (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow border border-gray-700">
      <div className="relative">
        <img 
          src={bat.image} 
          alt={`${bat.brand} ${bat.series}`}
          className="w-full h-64 object-contain bg-white cursor-pointer hover:scale-105 transition-transform"
          onClick={() => setSelectedImage(bat.image)}
        />
        <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-sm font-semibold">
          Best: ${lowestPrice}
        </div>
        <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-semibold">
          {bat.certification}
        </div>
      </div>
      
      <div className="p-4">
        <h3 className="font-bold text-lg mb-1 text-white">{bat.brand} {bat.series}</h3>
        <p className="text-sm text-gray-400 mb-2">
          {bat.year} • Model: {bat.modelNumber}{selectedVariant.length?.replace('"', '')}
        </p>
        
        <div className="text-sm text-gray-400 mb-4">
          <div>{bat.construction} • {bat.material}</div>
          <div>{bat.barrelSize} Barrel</div>
          {bat.swingWeight && <div>Swing Weight: {bat.swingWeight}</div>}
        </div>

        {/* USSSA: Drop Selection First */}
        {bat.certification === 'USSSA' && availableDropsForBat.length > 1 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-300 mb-2">Drop:</p>
            <div className="flex flex-wrap gap-2">
              {availableDropsForBat.map(drop => {
                const hasVariantsForDrop = bat.variants.some(v => v.drop === drop);
                const isSelected = selectedDrop === drop;
                
                return (
                  <button
                    key={drop}
                    onClick={() => {
                      setSelectedDrop(drop);
                      // Find first available variant with this drop
                      const firstVariant = bat.variants.find(v => v.drop === drop);
                      if (firstVariant) {
                        selectVariant(bat.id, firstVariant);
                      }
                    }}
                    disabled={!hasVariantsForDrop}
                    className={`px-3 py-1 text-sm rounded border transition-colors ${
                      isSelected 
                        ? 'bg-blue-500 text-white border-blue-500' 
                        : hasVariantsForDrop 
                          ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600' 
                          : 'bg-gray-900 text-gray-600 border-gray-800 cursor-not-allowed'
                    }`}
                  >
                    {drop}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Length Selection */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-300 mb-2">Length:</p>
          <div className="flex flex-wrap gap-2">
            {(bat.certification === 'USSSA' ? 
              // For USSSA: Show all possible lengths, grey out unavailable ones for selected drop
              availableLengths.map(length => {
                const variantForDropAndLength = bat.variants.find(v => v.length === length && v.drop === selectedDrop);
                const hasStock = variantForDropAndLength && (variantForDropAndLength.stock?.amazon || variantForDropAndLength.stock?.dicks || variantForDropAndLength.stock?.justbats);
                const isAvailableForDrop = !!variantForDropAndLength;
                const isSelected = selectedVariant.length === length && selectedVariant.drop === selectedDrop;
                
                return (
                  <button
                    key={length}
                    onClick={() => {
                      if (variantForDropAndLength) {
                        selectVariant(bat.id, variantForDropAndLength);
                      }
                    }}
                    disabled={!isAvailableForDrop || !hasStock}
                    className={`px-3 py-1 text-sm rounded border transition-colors ${
                      isSelected 
                        ? 'bg-blue-500 text-white border-blue-500' 
                        : isAvailableForDrop && hasStock
                          ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600' 
                          : 'bg-gray-900 text-gray-600 border-gray-800 cursor-not-allowed'
                    }`}
                  >
                    {length}
                  </button>
                );
              }) :
              // For BBCOR: Original logic
              availableLengths.map(length => {
                const availableVariants = bat.variants.filter(v => v.length === length);
                const hasStock = availableVariants.some(v => v.stock?.amazon || v.stock?.dicks || v.stock?.justbats);
                const isSelected = selectedVariant.length === length;
                
                return (
                  <button
                    key={length}
                    onClick={() => {
                      if (availableDropsForBat.length === 1) {
                        const variant = bat.variants.find(v => v.length === length);
                        if (variant) selectVariant(bat.id, variant);
                      } else {
                        const variant = bat.variants.find(v => v.length === length && v.drop === selectedVariant.drop) ||
                                       bat.variants.find(v => v.length === length);
                        if (variant) selectVariant(bat.id, variant);
                      }
                    }}
                    disabled={!hasStock}
                    className={`px-3 py-1 text-sm rounded border transition-colors ${
                      isSelected 
                        ? 'bg-blue-500 text-white border-blue-500' 
                        : hasStock 
                          ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600' 
                          : 'bg-gray-900 text-gray-600 border-gray-800 cursor-not-allowed'
                    }`}
                  >
                    {length}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Drop Selection for BBCOR (if multiple drops available) */}
        {bat.certification !== 'USSSA' && availableDropsForBat.length > 1 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-300 mb-2">Drop:</p>
            <div className="flex flex-wrap gap-2">
              {availableDropsForBat.map(drop => {
                const variant = bat.variants.find(v => v.length === selectedVariant.length && v.drop === drop);
                const hasStock = variant && (variant.stock?.amazon || variant.stock?.dicks || variant.stock?.justbats);
                const isSelected = selectedVariant.drop === drop;
                
                return (
                  <button
                    key={drop}
                    onClick={() => {
                      if (variant) selectVariant(bat.id, variant);
                    }}
                    disabled={!hasStock}
                    className={`px-3 py-1 text-sm rounded border transition-colors ${
                      isSelected 
                        ? 'bg-blue-500 text-white border-blue-500' 
                        : hasStock 
                          ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600' 
                          : 'bg-gray-900 text-gray-600 border-gray-800 cursor-not-allowed'
                    }`}
                  >
                    {drop}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* All Retailer Price Display */}
        <div className="space-y-2">
          {[
            { name: 'Amazon', key: 'amazon', priority: 1 },
            { name: 'JustBats', key: 'justbats', priority: 2 },
            { name: "Dick's", key: 'dicks', priority: 3 }
          ]
          .sort((a, b) => {
            const priceA = selectedVariant.price?.[a.key] || 999;
            const priceB = selectedVariant.price?.[b.key] || 999;
            
            if (priceA !== priceB) {
              return priceA - priceB; // Sort by price (lowest first)
            }
            return a.priority - b.priority; // If same price, sort by priority
          })
          .map(retailer => {
          const price = selectedVariant.price?.[retailer.key];
          const inStock = selectedVariant.stock?.[retailer.key];
          const isBest = retailer.key === bestRetailer && price === lowestPrice;
          
          return (
            <div 
              key={retailer.key}
              className={`flex justify-between items-center p-3 rounded border transition-colors cursor-pointer hover:bg-gray-700 ${
                isBest ? 'border-green-500 bg-green-900/30' : 'border-gray-600 bg-gray-700/50'
              } ${!inStock ? 'opacity-60' : ''}`}
              onClick={() => {
                console.log('selectedVariant ASIN:', selectedVariant.asin);
                console.log('Full selectedVariant:', selectedVariant);
                let url = '#';
                if (retailer.key === 'amazon') {
                  url = selectedVariant.asin 
                    ? `https://www.amazon.com/dp/${selectedVariant.asin}?tag=battracker-20`
                    : `https://www.amazon.com/s?k=${encodeURIComponent(`${bat.brand} ${bat.series} ${bat.certification} baseball bat`)}&tag=battracker-20`;
                } else if (retailer.key === 'justbats') {
                  url = bat.justbats_product_url || '#';
                } else if (retailer.key === 'dicks') {
                  url = bat.dicks_product_url || '#';
                }
                
                if (url !== '#') {
                  window.open(url, '_blank');
                }
              }}
            >
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-200">{retailer.name}</span>
                {!inStock && (
                  <span className="ml-2 text-xs text-red-400 bg-red-900/50 px-2 py-1 rounded">
                    Out of Stock
                  </span>
                )}
                {isBest && inStock && (
                  <span className="ml-2 text-sm font-bold text-green-400 bg-green-900/50 px-2 py-1 rounded whitespace-nowrap">
                    BEST
                  </span>
                )}
              </div>
              <div className="flex items-center">
                <span className={`font-semibold text-lg ${isBest && inStock ? 'text-green-400' : 'text-gray-200'}`}>
                  {price ? `$${price}` : 'N/A'}
                </span>
                <ExternalLink className="w-4 h-4 ml-2 text-gray-400" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
  );
};

  // Loading and error states
  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white text-xl">Loading bats...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-red-400 text-xl">Error: {error}</div>
    </div>
  );

  return (
 <div className="min-h-screen bg-black">
   {/* Header */}
   <header className="bg-gray-800 shadow-lg border-b border-gray-700">
     <div className="max-w-7xl mx-auto px-4 py-4">
       <div className="flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.location.href = '/'}>
         <img 
           src="/logo.png" 
           alt="Bat Price Tracker" 
           className="h-48 md:h-60 w-auto"
         />
       </div>
       <p className="text-gray-300 mt-1 text-sm md:text-base text-center">Compare baseball bat prices across top retailers</p>
     </div>
   </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by brand or bat name..."
              className="w-full pl-10 pr-4 py-3 text-lg bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Certification Buttons */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-3">
            {certifications.map(cert => (
              <button
                key={cert}
                onClick={() => {
                  if (selectedCertifications.includes(cert)) {
                    setSelectedCertifications(selectedCertifications.filter(c => c !== cert));
                  } else {
                    setSelectedCertifications([cert]); // Only allow one certification at a time
                  }
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedCertifications.includes(cert)
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'
                }`}
              >
                {cert}
              </button>
            ))}
          </div>
        </div>

        {/* Filters Section - Full Width Above Content */}
        <div className="mb-6">
          {/* Mobile Filter Toggle */}
          <div className="md:hidden mb-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 flex items-center justify-between text-white"
            >
              <span className="flex items-center">
                <Filter className="w-5 h-5 mr-2" />
                Filters
              </span>
              <ChevronDown className={`w-5 h-5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Filters Content - Full Width Rectangle */}
          <div className={`bg-gray-800 rounded-lg shadow-lg border border-gray-700 ${showFilters ? 'block' : 'hidden md:block'}`}>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center text-white">
                <Filter className="w-5 h-5 mr-2" />
                Filters
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {/* Drop Filter */}
                {availableFilters.drops.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Drop Weight
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableFilters.drops.map(drop => (
                        <button
                          key={drop}
                          onClick={() => toggleFilter(selectedDrops, setSelectedDrops, drop)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                            selectedDrops.includes(drop)
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                          }`}
                        >
                          {drop}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Brand Filter */}
                {availableFilters.brands.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Brand
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableFilters.brands.map(brand => (
                        <button
                          key={brand}
                          onClick={() => toggleFilter(selectedBrands, setSelectedBrands, brand)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                            selectedBrands.includes(brand)
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                          }`}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Material Filter */}
                {availableFilters.materials.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Material
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableFilters.materials.map(material => (
                        <button
                          key={material}
                          onClick={() => toggleFilter(selectedMaterials, setSelectedMaterials, material)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                            selectedMaterials.includes(material)
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                          }`}
                        >
                          {material}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Construction Filter */}
                {availableFilters.constructions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Construction
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableFilters.constructions.map(construction => (
                        <button
                          key={construction}
                          onClick={() => toggleFilter(selectedConstructions, setSelectedConstructions, construction)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                            selectedConstructions.includes(construction)
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                          }`}
                        >
                          {construction}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Swing Weight Filter */}
                {availableFilters.swingWeights.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Swing Weight
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableFilters.swingWeights.map(swingWeight => (
                        <button
                          key={swingWeight}
                          onClick={() => toggleFilter(selectedSwingWeights, setSelectedSwingWeights, swingWeight)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                            selectedSwingWeights.includes(swingWeight)
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                          }`}
                        >
                          {swingWeight}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Year Filter */}
                {availableFilters.years && availableFilters.years.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Year
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableFilters.years.map(year => (
                        <button
                          key={year}
                          onClick={() => toggleFilter(selectedYears, setSelectedYears, year)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                            selectedYears.includes(year)
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                          }`}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Price Range - Takes up full column */}
                <div className="md:col-span-2 lg:col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Price Range: ${priceRange[0]} - ${priceRange[1]}
                  </label>
                  <div className="px-2">
                    <input
                      type="range"
                      min="0"
                      max="600"
                      value={priceRange[1]}
                      onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>$0</span>
                      <span>$600</span>
                    </div>
                  </div>
                  
                  {/* Clear Filters Button */}
                  <button
                    onClick={clearAllFilters}
                    className="w-full mt-4 bg-gray-700 text-gray-300 py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Clear All Filters
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Now Full Width */}
        <div>
          {/* Sort and Results Count */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                {filteredBats.length} Bats Found
              </h2>
              {selectedCertifications.length > 0 && (
                <p className="text-sm text-gray-400 mt-1">
                  Showing {selectedCertifications.join(', ')} bats
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-300">Sort by:</label>
              <select
                className="p-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="year-price-high">Year + Price: High to Low</option>
                <option value="name">Name</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                
              </select>
            </div>
          </div>

          {/* Bat Grid */}
          {filteredBats.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {filteredBats.map(bat => (
                <BatCard key={bat.id} bat={bat} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-2">No bats found matching your criteria</div>
              <p className="text-gray-500 mb-4">Try adjusting your filters or search terms</p>
              <button
                onClick={clearAllFilters}
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Image Modal - ADD HERE */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div className="max-w-4xl max-h-full p-4">
            <img 
              src={selectedImage} 
              alt="Enlarged bat" 
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BatPriceTracker;