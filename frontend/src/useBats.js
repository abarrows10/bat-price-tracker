import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export const useBats = () => {
  const [bats, setBats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBats = async () => {
      try {
        setLoading(true);
        
        // Fetch bat models with their variants and prices
        const { data: batModels, error: modelsError } = await supabase
          .from('bat_models')
          .select(`
            *,
            bat_variants (
              *,
              prices (
                *,
                retailers (name)
              )
            )
          `);

        if (modelsError) throw modelsError;

        // Transform data and filter out incomplete bats
        const transformedBats = batModels
          .map(model => {
            // Only include variants that have pricing data
            const validVariants = model.bat_variants
              .filter(variant => variant.prices && variant.prices.length > 0)
              .map(variant => {
                // Group prices by retailer
                const priceObj = { amazon: 0, dicks: 0, justbats: 0 };
                const stockObj = { amazon: false, dicks: false, justbats: false };
                
                variant.prices.forEach(price => {
                  const retailerName = price.retailers.name.toLowerCase();
                  if (retailerName.includes('amazon')) {
                    priceObj.amazon = price.price;
                    stockObj.amazon = price.in_stock;
                  } else if (retailerName.includes('dick')) {
                    priceObj.dicks = price.price;
                    stockObj.dicks = price.in_stock;
                  } else if (retailerName.includes('justbats')) {
                    priceObj.justbats = price.price;
                    stockObj.justbats = price.in_stock;
                  }
                });

                return {
                  length: variant.length,
                  drop: variant.drop,
                  asin: variant.asin,
                  price: priceObj,
                  stock: stockObj
                };
              });

            // Only return bat models that have at least one valid variant
            if (validVariants.length === 0) {
              return null;
            }

            return {
              id: model.id,
              brand: model.brand,
              series: model.series,
              year: model.year,
              modelNumber: model.model_number || model.id.toString(),
              swingWeight: model.swing_weight,
              certification: model.certification,
              material: model.material,
              construction: model.construction,
              barrelSize: model.barrel_size,
              image: model.image_url || `https://via.placeholder.com/200x300/1F2937/60A5FA?text=${encodeURIComponent(model.series)}`,
              // Retailer URLs for affiliate tracking
              amazon_affiliate_url: model.amazon_product_url,
              justbats_product_url: model.justbats_product_url,
              dicks_product_url: model.dicks_product_url,
              variants: validVariants,
              rating: model.rating || 4.0,
              reviews: model.review_count || 0
            };
          })
          .filter(bat => bat !== null); // Remove null entries (bats with no valid variants)

        setBats(transformedBats);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching bats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBats();
  }, []);

  return { bats, loading, error };
};