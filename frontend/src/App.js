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
  const [selectedYears, setSelectedYears] = useState([]); // New year filter
  const [priceRange, setPriceRange] = useState([0, 600]);
  const [sortBy, setSortBy] = useState('certification-price');
  const [selectedImage, setSelectedImage] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Selected variant for each bat (default to most popular size)
  const [selectedVariants, setSelectedVariants] = useState(() => {
    const defaults = {};
    bats.forEach(bat => {
      let defaultVariant;
      if (bat.certification === 'BBCOR') {
        defaultVariant = bat.variants?.find(v => v.length === '32"') || bat.variants?.[0];
      } else if (bat.certification === 'USSSA') {
        if (bat.variants?.some(v => v.drop === '-10')) {
          defaultVariant = bat.variants.find(v => v.length === '29"' && v.drop === '-10') || 
                          bat.variants.find(v => v.drop === '-10');
        } else if (bat.variants?.some(v => v.drop === '-8')) {
          defaultVariant = bat.variants.find(v => v.length === '30"' && v.drop === '-8') || 
                          bat.variants.find(v => v.drop === '-8');
        } else {
          defaultVariant = bat.variants?.find(v => v.length === '31"' && v.drop === '-5') || 
                          bat.variants?.find(v => v.drop === '-5');
        }
      } else if (bat.certification === 'USA Baseball') {
        if (bat.variants?.some(v => v.drop === '-10')) {
          defaultVariant = bat.variants.find(v => v.length === '29"' && v.drop === '-10') || 
                          bat.variants.find(v => v.drop === '-10');
        } else if (bat.variants?.some(v => v.drop === '-8')) {
          defaultVariant = bat.variants.find(v => v.length === '30"' && v.drop === '-8') || 
                          bat.variants.find(v => v.drop === '-8');
        } else {
          defaultVariant = bat.variants?.find(v => v.length === '31"' && v.drop === '-5') || 
                          bat.variants?.find(v => v.drop === '-5');
        }
      }
      defaults[bat.id] = defaultVariant || bat.variants?.[0];
    });
    return defaults;
  });

  // Get unique filter values
  const certifications = [...new Set(bats.map(bat => bat.certification))];
  const brands = [...new Set(bats.map(bat => bat.brand))].sort();
  const materials = [...new Set(bats.map(bat => bat.material))].filter(Boolean).sort();
  const constructions = [...new Set(bats.map(bat => bat.construction))].filter(Boolean).sort();
  const years = [...new Set(bats.map(bat => bat.year))].filter(Boolean).sort((a, b) => b - a); // New years array, sorted newest first
  
  // Get drops and swing weights from selected variants
  const allDrops = [...new Set(bats.flatMap(bat => 
    bat.variants?.map(v => v.drop) || []
  ))].sort();
  
  const allSwingWeights = [...new Set(bats.map(bat => bat.swingWeight))].filter(Boolean).sort();

  // Filter and sort bats
  const filteredBats = useMemo(() => {
    let filtered = bats.filter(bat => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          bat.brand.toLowerCase().includes(searchLower) ||
          bat.series.toLowerCase().includes(searchLower) ||
          `${bat.brand} ${bat.series}`.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Certification filter
      if (selectedCertifications.length > 0 && !selectedCertifications.includes(bat.certification)) {
        return false;
      }

      // Brand filter
      if (selectedBrands.length > 0 && !selectedBrands.includes(bat.brand)) {
        return false;
      }

      // Material filter
      if (selectedMaterials.length > 0 && !selectedMaterials.includes(bat.material)) {
        return false;
      }

      // Construction filter
      if (selectedConstructions.length > 0 && !selectedConstructions.includes(bat.construction)) {
        return false;
      }

      // Year filter (new)
      if (selectedYears.length > 0 && !selectedYears.includes(bat.year)) {
        return false;
      }

      // Drop filter (based on selected variant)
      const selectedVariant = selectedVariants[bat.id];
      if (selectedDrops.length > 0 && selectedVariant && !selectedDrops.includes(selectedVariant.drop)) {
        return false;
      }

      // Swing weight filter
      if (selectedSwingWeights.length > 0 && !selectedSwingWeights.includes(bat.swingWeight)) {
        return false;
      }

      // Price filter (based on selected variant)
      if (selectedVariant) {
        const lowestPrice = Math.min(
          ...[selectedVariant.price.amazon, selectedVariant.price.dicks, selectedVariant.price.justbats]
            .filter(price => price > 0)
        );
        if (lowestPrice < priceRange[0] || lowestPrice > priceRange[1]) {
          return false;
        }
      }

      return true;
    });

    // Sort bats
    filtered.sort((a, b) => {
      const aVariant = selectedVariants[a.id];
      const bVariant = selectedVariants[b.id];

      switch (sortBy) {
        case 'certification-price':
          // First by certification (BBCOR, then USSSA, then USA Baseball)
          const certOrder = { 'BBCOR': 0, 'USSSA': 1, 'USA Baseball': 2 };
          const certDiff = (certOrder[a.certification] || 3) - (certOrder[b.certification] || 3);
          if (certDiff !== 0) return certDiff;
          
          // Then by lowest price
          const aPrice = aVariant ? Math.min(...[aVariant.price.amazon, aVariant.price.dicks, aVariant.price.justbats].filter(p => p > 0)) : Infinity;
          const bPrice = bVariant ? Math.min(...[bVariant.price.amazon, bVariant.price.dicks, bVariant.price.justbats].filter(p => p > 0)) : Infinity;
          return aPrice - bPrice;
        
        case 'price-low':
          const aPriceLow = aVariant ? Math.min(...[aVariant.price.amazon, aVariant.price.dicks, aVariant.price.justbats].filter(p => p > 0)) : Infinity;
          const bPriceLow = bVariant ? Math.min(...[bVariant.price.amazon, bVariant.price.dicks, bVariant.price.justbats].filter(p => p > 0)) : Infinity;
          return aPriceLow - bPriceLow;
        
        case 'price-high':
          const aPriceHigh = aVariant ? Math.min(...[aVariant.price.amazon, aVariant.price.dicks, aVariant.price.justbats].filter(p => p > 0)) : -1;
          const bPriceHigh = bVariant ? Math.min(...[bVariant.price.amazon, bVariant.price.dicks, bVariant.price.justbats].filter(p => p > 0)) : -1;
          return bPriceHigh - aPriceHigh;
        
        case 'brand':
          return a.brand.localeCompare(b.brand);
        
        case 'year':
          return (b.year || 0) - (a.year || 0);
        
        default:
          return 0;
      }
    });

    return filtered;
  }, [bats, searchTerm, selectedCertifications, selectedBrands, selectedMaterials, selectedConstructions, selectedYears, selectedDrops, selectedSwingWeights, priceRange, sortBy, selectedVariants]);

  // Rest of your component code stays the same until the render return...

  // Function to get lowest price and retailer for a variant
  const getLowestPrice = (variant) => {
    const prices = [
      { price: variant.price.amazon, retailer: 'Amazon', inStock: variant.stock.amazon },
      { price: variant.price.dicks, retailer: 'Dick\'s', inStock: variant.stock.dicks },
      { price: variant.price.justbats, retailer: 'JustBats', inStock: variant.stock.justbats }
    ].filter(item => item.price > 0);

    if (prices.length === 0) return { price: null, retailer: null, inStock: false };

    const lowest = prices.reduce((min, current) => 
      current.price < min.price ? current : min
    );

    return lowest;
  };

  const BatCard = ({ bat }) => {
    const selectedVariant = selectedVariants[bat.id];
    const { price: lowestPrice, retailer: lowestRetailer, inStock } = selectedVariant ? getLowestPrice(selectedVariant) : { price: null, retailer: null, inStock: false };

    const openImageModal = (imageSrc) => {
      setSelectedImage(imageSrc);
    };

    const closeImageModal = () => {
      setSelectedImage(null);
    };

    return (
      <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700 hover:border-blue-500 transition-all duration-200">
        {/* Bat Image */}
        <div className="mb-4 text-center">
          <img 
            src={bat.image} 
            alt={`${bat.brand} ${bat.series}`}
            className="w-full h-40 object-contain mx-auto cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => openImageModal(bat.image)}
          />
        </div>

        {/* Bat Info */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white mb-2">
            {bat.brand} {bat.series} {bat.year}
          </h3>
          
          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              bat.certification === 'BBCOR' ? 'bg-blue-900 text-blue-200' :
              bat.certification === 'USSSA' ? 'bg-green-900 text-green-200' :
              'bg-purple-900 text-purple-200'
            }`}>
              {bat.certification}
            </span>
            <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded-full text-xs">
              {bat.material}
            </span>
            <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded-full text-xs">
              {bat.construction}
            </span>
          </div>

          {/* Variant Selector */}
          {bat.variants && bat.variants.length > 1 && (
            <div className="mb-3">
              <select
                className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                value={selectedVariant ? `${selectedVariant.length}-${selectedVariant.drop}` : ''}
                onChange={(e) => {
                  const [length, drop] = e.target.value.split('-');
                  const variant = bat.variants.find(v => v.length === length && v.drop === drop);
                  setSelectedVariants(prev => ({
                    ...prev,
                    [bat.id]: variant
                  }));
                }}
              >
                {bat.variants.map((variant, index) => (
                  <option 
                    key={index} 
                    value={`${variant.length}-${variant.drop}`}
                  >
                    {variant.length} / {variant.drop}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Price Display */}
          {selectedVariant && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Best Price:</span>
                <div className="flex items-center">
                  <span className={`text-2xl font-bold ${inStock ? 'text-green-400' : 'text-red-400'}`}>
                    {lowestPrice ? `$${lowestPrice}` : 'N/A'}
                  </span>
                  {lowestRetailer && (
                    <span className="ml-2 text-xs text-gray-400">at {lowestRetailer}</span>
                  )}
                </div>
              </div>
              
              {!inStock && lowestPrice && (
                <p className="text-red-400 text-xs">Currently out of stock</p>
              )}
            </div>
          )}
        </div>

        {/* Price Comparison */}
        <div className="space-y-2">
          {selectedVariant && [
            { name: 'Amazon', price: selectedVariant.price.amazon, inStock: selectedVariant.stock.amazon, url: bat.amazon_affiliate_url },
            { name: 'JustBats', price: selectedVariant.price.justbats, inStock: selectedVariant.stock.justbats, url: bat.justbats_product_url },
            { name: 'Dick\'s', price: selectedVariant.price.dicks, inStock: selectedVariant.stock.dicks, url: bat.dicks_product_url }
          ].map(({ name, price, inStock, url }) => {
            const isLowest = price > 0 && price === lowestPrice;
            
            return (
              <div 
                key={name}
                className={`flex items-center justify-between p-3 rounded border transition-colors ${
                  isLowest 
                    ? 'bg-green-900 border-green-600' 
                    : 'bg-gray-700 border-gray-600 hover:bg-gray-650'
                } ${url ? 'cursor-pointer' : ''}`}
                onClick={() => url && window.open(url, '_blank')}
              >
                <div className="flex items-center">
                  <span className="font-medium text-white">{name}</span>
                  {isLowest && (
                    <span className="ml-2 px-2 py-1 bg-green-600 text-green-100 text-xs rounded">
                      BEST
                    </span>
                  )}
                </div>
                <div className="flex items-center">
                  <span className={`font-semibold ${
                    price > 0 
                      ? inStock 
                        ? isLowest 
                          ? 'text-green-400' 
                          : 'text-gray-200'
                        : 'text-red-400'
                      : 'text-gray-400'
                  }`}>
                    {price > 0 ? `$${price}` : 'N/A'}
                  </span>
                  <ExternalLink className="w-4 h-4 ml-2 text-gray-400" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Loading and error states
  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading bats...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-red-400 text-xl">Error: {error}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 shadow-lg border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center">
            <TrendingUp className="w-6 h-6 md:w-8 md:h-8 mr-2 text-blue-400" />
            Bat Tracker
          </h1>
          <p className="text-gray-300 mt-1 text-sm md:text-base">Compare baseball bat prices across top retailers</p>
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
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {cert}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Filters */}
        <div className="mb-6">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
          >
            <Filter className="w-4 h-4 mr-2" />
            Advanced Filters
            <ChevronDown className={`w-4 h-4 ml-2 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {showFilters && (
            <div className="mt-4 p-6 bg-gray-800 rounded-lg border border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* Brand Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Brand</label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {brands.map(brand => (
                      <label key={brand} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedBrands.includes(brand)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBrands([...selectedBrands, brand]);
                            } else {
                              setSelectedBrands(selectedBrands.filter(b => b !== brand));
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-300">{brand}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Year Filter (new) */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Year</label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {years.map(year => (
                      <label key={year} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedYears.includes(year)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedYears([...selectedYears, year]);
                            } else {
                              setSelectedYears(selectedYears.filter(y => y !== year));
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-300">{year}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Material Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Material</label>
                  <div className="space-y-2">
                    {materials.map(material => (
                      <label key={material} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedMaterials.includes(material)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMaterials([...selectedMaterials, material]);
                            } else {
                              setSelectedMaterials(selectedMaterials.filter(m => m !== material));
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-300">{material}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Construction Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Construction</label>
                  <div className="space-y-2">
                    {constructions.map(construction => (
                      <label key={construction} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedConstructions.includes(construction)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedConstructions([...selectedConstructions, construction]);
                            } else {
                              setSelectedConstructions(selectedConstructions.filter(c => c !== construction));
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-300">{construction}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Drop Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Drop</label>
                  <div className="space-y-2">
                    {allDrops.map(drop => (
                      <label key={drop} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedDrops.includes(drop)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDrops([...selectedDrops, drop]);
                            } else {
                              setSelectedDrops(selectedDrops.filter(d => d !== drop));
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-300">{drop}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Swing Weight Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Swing Weight</label>
                  <div className="space-y-2">
                    {allSwingWeights.map(weight => (
                      <label key={weight} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedSwingWeights.includes(weight)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSwingWeights([...selectedSwingWeights, weight]);
                            } else {
                              setSelectedSwingWeights(selectedSwingWeights.filter(w => w !== weight));
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-300">{weight}</span>
                      </label>
                    ))}
                  </div>
                </div>

              </div>

              {/* Price Range */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Price Range: ${priceRange[0]} - ${priceRange[1]}
                </label>
                <div className="flex space-x-4">
                  <input
                    type="range"
                    min="0"
                    max="600"
                    value={priceRange[0]}
                    onChange={(e) => setPriceRange([parseInt(e.target.value), priceRange[1]])}
                    className="flex-1"
                  />
                  <input
                    type="range"
                    min="0"
                    max="600"
                    value={priceRange[1]}
                    onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Clear Filters */}
              <div className="mt-6">
                <button
                  onClick={() => {
                    setSelectedBrands([]);
                    setSelectedMaterials([]);
                    setSelectedConstructions([]);
                    setSelectedDrops([]);
                    setSelectedSwingWeights([]);
                    setSelectedYears([]);
                    setPriceRange([0, 600]);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sort and Results Count */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div className="text-gray-300">
            Showing {filteredBats.length} of {bats.length} bats
          </div>
          
          <div className="flex items-center space-x-2">
            <label className="text-gray-300 text-sm">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="certification-price">Certification & Price</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="brand">Brand A-Z</option>
              <option value="year">Newest First</option>
            </select>
          </div>
        </div>

        {/* Bat Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {filteredBats.map(bat => (
            <BatCard key={bat.id} bat={bat} />
          ))}
        </div>

        {/* No Results */}
        {filteredBats.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">No bats found</div>
            <div className="text-gray-500">Try adjusting your search or filters</div>
          </div>
        )}
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={closeImageModal}
        >
          <div className="relative max-w-4xl max-h-full">
            <img 
              src={selectedImage}
              alt="Bat Detail"
              className="max-w-full max-h-full object-contain"
            />
            <button
              onClick={closeImageModal}
              className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatPriceTracker;